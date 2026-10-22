const { MikrotikAPI } = require('@fibercom/routeros-api');
const db = require('../db');
const { decryptPassword } = require('./router-credentials');

const CACHE_TTL_MS = 10_000;
let cachedSnapshot = null;
let snapshotPromise = null;

function routerConfig(env = process.env) {
  const host = env.MIKROTIK_HOST?.trim() || '';
  const user = env.MIKROTIK_USER?.trim() || '';
  const password = env.MIKROTIK_PASSWORD || '';
  if (!host && !user && !password) return { status: 'unconfigured' };
  if (!host || !user || !password) return { status: 'misconfigured' };

  const tlsValue = env.MIKROTIK_TLS?.trim().toLowerCase();
  const tls = tlsValue === undefined || tlsValue === '' || tlsValue === 'true';
  if (tlsValue && !['true', 'false'].includes(tlsValue)) {
    return { status: 'misconfigured' };
  }

  const port = Number(env.MIKROTIK_PORT || (tls ? 8729 : 8728));
  const timeout = Number(env.MIKROTIK_TIMEOUT_SECONDS || 5);
  if (!Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isInteger(timeout) || timeout < 1 || timeout > 30) {
    return { status: 'misconfigured' };
  }

  return {
    status: 'configured',
    options: { host, user, password, port, timeout, tls, keepalive: false },
  };
}

function storedRouterConfig(router) {
  return {
    id: router.id,
    name: router.name,
    status: 'configured',
    options: {
      host: router.host,
      user: router.username,
      password: decryptPassword({
        ciphertext: router.password_ciphertext,
        iv: router.password_iv,
        authTag: router.password_auth_tag,
      }),
      port: router.port,
      timeout: router.timeout_seconds,
      tls: router.use_tls,
      keepalive: false,
    },
  };
}

function normalizeSession(row, router) {
  return {
    username: row.name || '',
    ipAddress: row.address || null,
    callerId: row['caller-id'] || null,
    uptime: row.uptime || null,
    service: row.service || null,
    routerId: router.id || null,
    routerName: router.name,
  };
}

async function readRouterSessions(router) {
  const checkedAt = new Date().toISOString();
  if (router.status !== 'configured') {
    return {
      id: router.id || null,
      name: router.name,
      status: router.status,
      checkedAt: router.status === 'unconfigured' ? null : checkedAt,
      sessions: [],
      ...(router.status === 'misconfigured'
        ? { message: 'Konfigurasi koneksi MikroTik belum lengkap atau tidak valid.' }
        : {}),
    };
  }

  const api = new MikrotikAPI(router.options);
  let socketError = null;
  api.on('error', (error) => { socketError = error; });
  api.on('timeout', (error) => { socketError = error; });
  let result;
  try {
    await api.connect();
    const rows = await api.write('/ppp/active/print');
    if (socketError) throw socketError;
    result = {
      id: router.id || null,
      name: router.name,
      status: 'connected',
      checkedAt: new Date().toISOString(),
      sessions: rows.map((row) => normalizeSession(row, router)),
    };
  } catch {
    result = {
      id: router.id || null,
      name: router.name,
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
      sessions: [],
      message: 'Tidak dapat membaca sesi PPPoE dari MikroTik. Periksa API, firewall, dan akun baca-saja.',
    };
  } finally {
    if (api.connected) {
      try {
        await api.close();
      } catch {
        result = {
          id: router.id || null,
          name: router.name,
          status: 'unavailable',
          checkedAt: new Date().toISOString(),
          sessions: [],
          message: 'Koneksi ke MikroTik tidak dapat ditutup dengan benar.',
        };
      }
    }
  }
  return result;
}

async function getRouterConfigs() {
  const result = await db.query(
    `SELECT id, name, host, port, username, password_ciphertext,
            password_iv, password_auth_tag, use_tls, timeout_seconds, is_active
     FROM mikrotik_routers
     ORDER BY name`,
  );
  const routers = result.rows.map((router) => (router.is_active
    ? storedRouterConfig(router)
    : { id: router.id, name: router.name, status: 'disabled' }));
  const legacy = routerConfig();
  if (legacy.status !== 'unconfigured') {
    routers.push({
      id: null,
      name: 'MikroTik (environment)',
      ...legacy,
    });
  }
  return routers;
}

async function readActivePppSessions() {
  const configs = await getRouterConfigs();
  if (!configs.length) {
    return {
      status: 'unconfigured',
      checkedAt: null,
      sessions: [],
      routers: [],
    };
  }

  const routers = await Promise.all(configs.map(readRouterSessions));
  const activeRouters = routers.filter((router) => router.status !== 'disabled');
  const connected = activeRouters.filter((router) => router.status === 'connected').length;
  const status = connected === activeRouters.length && activeRouters.length > 0
    ? 'connected'
    : connected > 0 ? 'partial' : 'unavailable';
  return {
    status,
    checkedAt: new Date().toISOString(),
    sessions: routers.flatMap((router) => router.sessions),
    routers,
    ...(connected < activeRouters.length
      ? { message: 'Satu atau lebih router MikroTik tidak dapat dijangkau.' }
      : {}),
  };
}

async function testRouterConnection(router) {
  const result = await readRouterSessions(router);
  return {
    status: result.status,
    checkedAt: result.checkedAt,
    ...(result.message ? { message: result.message } : {}),
  };
}

async function getPppSessionSnapshot(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSnapshot && now - cachedSnapshot.cachedAt < CACHE_TTL_MS) {
    return cachedSnapshot.value;
  }
  if (snapshotPromise) return snapshotPromise;

  snapshotPromise = readActivePppSessions()
    .then((value) => {
      cachedSnapshot = { value, cachedAt: Date.now() };
      return value;
    })
    .finally(() => {
      snapshotPromise = null;
    });
  return snapshotPromise;
}

function invalidateRouterCache() {
  cachedSnapshot = null;
}

function enrichPppServices(services, snapshot) {
  const activeSessions = new Map(
    snapshot.sessions.map((session) => [`${session.routerId || ''}:${session.username}`, session]),
  );
  const routers = snapshot.routers || [];
  const routerStatuses = new Map(routers.map((router) => [router.id || '', router.status]));
  return services.map((service) => {
    const routerId = service.router_id || service.routerId || null;
    const username = service.pppoe_username || service.pppoeUsername;
    const routerKey = routerId || '';
    const routerStatus = routerStatuses.has(routerKey)
      ? routerStatuses.get(routerKey)
      : routers.length ? 'unavailable' : snapshot.status;
    const session = activeSessions.get(`${routerId || ''}:${username}`);
    return {
      ...service,
      connection_status: routerStatus !== 'connected'
        ? 'unknown'
        : session ? 'connected' : 'disconnected',
      ip_address: session?.ipAddress || null,
      caller_id: session?.callerId || null,
      connection_uptime: session?.uptime || null,
      connection_service: session?.service || null,
    };
  });
}

function publicRouterStatus(snapshot) {
  return {
    status: snapshot.status,
    checkedAt: snapshot.checkedAt,
    ...(snapshot.message ? { message: snapshot.message } : {}),
    ...(snapshot.routers ? {
      routers: snapshot.routers.map(({ id, name, status, checkedAt, message }) => ({
        id, name, status, checkedAt, ...(message ? { message } : {}),
      })),
    } : {}),
  };
}

module.exports = {
  enrichPppServices,
  getPppSessionSnapshot,
  invalidateRouterCache,
  publicRouterStatus,
  readRouterSessions,
  routerConfig,
  testRouterConnection,
};
