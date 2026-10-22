const { Router } = require('express');
const net = require('node:net');
const { z } = require('zod');
const db = require('../db');
const { requireRole } = require('../middleware/auth');
const { decryptPassword, encryptPassword } = require('../services/router-credentials');
const {
  invalidateRouterCache,
  testRouterConnection,
} = require('../services/mikrotik');

const router = Router();
const routerFields = {
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._:-]+$/),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().min(1).max(128),
  useTls: z.boolean(),
  timeoutSeconds: z.number().int().min(1).max(30),
  radiusServerAddress: z.string().trim().min(1).max(255)
    .regex(/^[A-Za-z0-9.:-]+$/),
  radiusClientAddress: z.string().trim().refine(
    (value) => net.isIPv4(value),
    'Expected an IPv4 address',
  ),
  radiusAuthPort: z.number().int().min(1).max(65535).default(1812),
  radiusAccountingPort: z.number().int().min(1).max(65535).default(1813),
  timezoneName: z.string().trim().min(1).max(100)
    .regex(/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/),
  isolationInfoUrl: z.union([
    z.string().trim().url().max(500),
    z.literal(''),
  ]).optional(),
};
const createSchema = z.object({
  ...routerFields,
  password: z.string().min(1).max(200),
  radiusSecret: z.string().min(16).max(200),
});
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(routerFields).map(([key, value]) => [key, value.optional()])),
  password: z.string().min(1).max(200).optional(),
  radiusSecret: z.string().min(16).max(200).optional(),
  isActive: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0);
const publicColumns = `id, name, host, port, username, use_tls,
  timeout_seconds, radius_server_address, radius_client_address,
  radius_auth_port, radius_accounting_port, timezone_name,
  isolation_info_url, is_active, created_at, updated_at`;

router.use(requireRole('admin'));

router.get('/', async (_req, res) => {
  const result = await db.query(
    `SELECT ${publicColumns} FROM mikrotik_routers ORDER BY name`,
  );
  return res.json({
    data: result.rows,
    radius: {
      enabled: process.env.RADIUS_ENABLED === 'true',
      authPort: Number(process.env.RADIUS_AUTH_PORT || 1812),
      accountingPort: Number(process.env.RADIUS_ACCOUNTING_PORT || 1813),
    },
  });
});

router.post('/', async (req, res) => {
  const input = createSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({ error: 'Invalid router data', details: input.error.flatten() });
  }
  const authPort = Number(process.env.RADIUS_AUTH_PORT || 1812);
  const accountingPort = Number(process.env.RADIUS_ACCOUNTING_PORT || 1813);
  if (input.data.radiusAuthPort !== authPort || input.data.radiusAccountingPort !== accountingPort) {
    return res.status(400).json({
      error: `Port RADIUS router harus sama dengan listener backend: authentication ${authPort}, accounting ${accountingPort}`,
    });
  }
  let encrypted;
  let encryptedRadiusSecret;
  try {
    encrypted = encryptPassword(input.data.password);
    encryptedRadiusSecret = encryptPassword(input.data.radiusSecret);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const {
    name, host, port, username, useTls, timeoutSeconds,
    radiusServerAddress, radiusClientAddress, radiusAuthPort,
    radiusAccountingPort, timezoneName, isolationInfoUrl,
  } = input.data;
  const result = await db.query(
    `INSERT INTO mikrotik_routers (
       name, host, port, username, password_ciphertext, password_iv,
       password_auth_tag, use_tls, timeout_seconds, radius_server_address,
       radius_client_address, radius_secret_ciphertext, radius_secret_iv,
       radius_secret_auth_tag, radius_auth_port, radius_accounting_port,
       timezone_name, isolation_info_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING ${publicColumns}`,
    [name, host, port, username, encrypted.ciphertext, encrypted.iv,
      encrypted.authTag, useTls, timeoutSeconds, radiusServerAddress,
      radiusClientAddress, encryptedRadiusSecret.ciphertext,
      encryptedRadiusSecret.iv, encryptedRadiusSecret.authTag,
      radiusAuthPort, radiusAccountingPort, timezoneName,
      isolationInfoUrl || null],
  );
  invalidateRouterCache();
  return res.status(201).json({ data: result.rows[0] });
});

router.post('/:id/script', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid router ID' });
  }
  const result = await db.query(
    `SELECT id, name, username, password_ciphertext, password_iv,
            password_auth_tag, radius_server_address, radius_secret_ciphertext,
            radius_secret_iv, radius_secret_auth_tag, radius_auth_port,
            radius_accounting_port, timezone_name, isolation_info_url
     FROM mikrotik_routers WHERE id = $1 AND is_active`,
    [req.params.id],
  );
  const stored = result.rows[0];
  if (!stored) return res.status(404).json({ error: 'Active router not found' });
  if (!stored.radius_secret_ciphertext || !stored.radius_server_address) {
    return res.status(409).json({ error: 'Konfigurasi RADIUS router belum lengkap' });
  }
  try {
    const apiPassword = decryptPassword({
      ciphertext: stored.password_ciphertext,
      iv: stored.password_iv,
      authTag: stored.password_auth_tag,
    });
    const radiusSecret = decryptPassword({
      ciphertext: stored.radius_secret_ciphertext,
      iv: stored.radius_secret_iv,
      authTag: stored.radius_secret_auth_tag,
    });
    const authPort = Number(process.env.RADIUS_AUTH_PORT || 1812);
    const accountingPort = Number(process.env.RADIUS_ACCOUNTING_PORT || 1813);
    if (!Number.isInteger(authPort) || !Number.isInteger(accountingPort)) {
      return res.status(503).json({ error: 'Port RADIUS backend belum valid' });
    }
    const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, '')}"`;
    const suffix = stored.id.replace(/-/g, '').slice(0, 10);
    const groupName = `instalink-${suffix}-read`;
    const script = [
      `:local groupName ${quote(groupName)}`,
      `:if ([:len [/user group find where name=$groupName]] = 0) do={ /user group add name=$groupName policy=read,api comment="InstaLink read-only API" } else={ /user group set [find where name=$groupName] policy=read,api }`,
      `:local apiUser ${quote(stored.username)}`,
      `:if ([:len [/user find where name=$apiUser]] = 0) do={ /user add name=$apiUser group=$groupName password=${quote(apiPassword)} } else={ /user set [find where name=$apiUser] group=$groupName password=${quote(apiPassword)} }`,
      `/system clock set time-zone-name=${quote(stored.timezone_name)}`,
      `:local radiusComment ${quote(`InstaLink ${stored.name}`)}`,
      `:if ([:len [/radius find where comment=$radiusComment]] = 0) do={ /radius add service=ppp address=${quote(stored.radius_server_address)} src-address=${quote(stored.radius_client_address)} authentication-port=${stored.radius_auth_port} accounting-port=${stored.radius_accounting_port} secret=${quote(radiusSecret)} timeout=2s comment=$radiusComment } else={ /radius set [find where comment=$radiusComment] service=ppp address=${quote(stored.radius_server_address)} src-address=${quote(stored.radius_client_address)} authentication-port=${stored.radius_auth_port} accounting-port=${stored.radius_accounting_port} secret=${quote(radiusSecret)} timeout=2s }`,
      `/ppp aaa set use-radius=yes accounting=yes interim-update=5m`,
      ...(stored.isolation_info_url
        ? [`:put ${quote(`URL informasi isolir: ${stored.isolation_info_url}`)}`]
        : []),
    ].join('\n');
    return res.json({
      data: {
        script,
        authPort,
        accountingPort,
        isolationInfoUrl: stored.isolation_info_url,
      },
    });
  } catch (error) {
    if (error.message.includes('MIKROTIK_ENCRYPTION_KEY')) {
      return res.status(503).json({ error: error.message });
    }
    throw error;
  }
});

router.get('/:id/sessions', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid router ID' });
  }
  const result = await db.query(
    `SELECT accounting_session_id, service_id, username, framed_ip_address,
            status, started_at, last_accounting_at, stopped_at,
            session_seconds, input_octets, output_octets, terminate_cause
     FROM radius_accounting_sessions
     WHERE router_id = $1
     ORDER BY last_accounting_at DESC
     LIMIT 100`,
    [req.params.id],
  );
  return res.json({ data: result.rows });
});

router.post('/:id/test', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid router ID' });
  }
  const result = await db.query(
    `SELECT id, name, host, port, username, password_ciphertext,
            password_iv, password_auth_tag, use_tls, timeout_seconds
     FROM mikrotik_routers WHERE id = $1`,
    [req.params.id],
  );
  const stored = result.rows[0];
  if (!stored) return res.status(404).json({ error: 'Router not found' });

  try {
    const connection = await testRouterConnection({
      id: stored.id,
      name: stored.name,
      status: 'configured',
      options: {
        host: stored.host,
        user: stored.username,
        password: decryptPassword({
          ciphertext: stored.password_ciphertext,
          iv: stored.password_iv,
          authTag: stored.password_auth_tag,
        }),
        port: stored.port,
        timeout: stored.timeout_seconds,
        tls: stored.use_tls,
        keepalive: false,
      },
    });
    return res.json({ data: connection });
  } catch (error) {
    if (error.message.includes('MIKROTIK_ENCRYPTION_KEY')) {
      return res.status(503).json({ error: error.message });
    }
    throw error;
  }
});

router.patch('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid router ID' });
  }
  const input = updateSchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({ error: 'Invalid router data', details: input.error.flatten() });
  }
  const authPort = Number(process.env.RADIUS_AUTH_PORT || 1812);
  const accountingPort = Number(process.env.RADIUS_ACCOUNTING_PORT || 1813);
  if ((input.data.radiusAuthPort !== undefined && input.data.radiusAuthPort !== authPort)
    || (input.data.radiusAccountingPort !== undefined
      && input.data.radiusAccountingPort !== accountingPort)) {
    return res.status(400).json({
      error: `Port RADIUS router harus sama dengan listener backend: authentication ${authPort}, accounting ${accountingPort}`,
    });
  }
  const existing = await db.query(
    'SELECT id FROM mikrotik_routers WHERE id = $1',
    [req.params.id],
  );
  if (!existing.rowCount) return res.status(404).json({ error: 'Router not found' });

  const values = input.data;
  if (values.isActive === false) {
    const assigned = await db.query(
      `SELECT COUNT(*)::int AS service_count
       FROM services WHERE router_id = $1 AND status = 'active'`,
      [req.params.id],
    );
    if (assigned.rows[0].service_count > 0) {
      return res.status(409).json({
        error: 'Pindahkan layanan PPPoE yang masih aktif ke router lain sebelum menonaktifkan router ini',
        serviceCount: assigned.rows[0].service_count,
      });
    }
  }
  let encrypted = null;
  let encryptedRadiusSecret = null;
  if (values.password !== undefined) {
    try {
      encrypted = encryptPassword(values.password);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  }
  if (values.radiusSecret !== undefined) {
    try {
      encryptedRadiusSecret = encryptPassword(values.radiusSecret);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
  }
  const result = await db.query(
    `UPDATE mikrotik_routers SET
       name = COALESCE($2, name),
       host = COALESCE($3, host),
       port = COALESCE($4, port),
       username = COALESCE($5, username),
       password_ciphertext = COALESCE($6, password_ciphertext),
       password_iv = COALESCE($7, password_iv),
       password_auth_tag = COALESCE($8, password_auth_tag),
       use_tls = COALESCE($9, use_tls),
       timeout_seconds = COALESCE($10, timeout_seconds),
       radius_server_address = COALESCE($11, radius_server_address),
       radius_client_address = COALESCE($12, radius_client_address),
       radius_secret_ciphertext = COALESCE($13, radius_secret_ciphertext),
       radius_secret_iv = COALESCE($14, radius_secret_iv),
       radius_secret_auth_tag = COALESCE($15, radius_secret_auth_tag),
       radius_auth_port = COALESCE($16, radius_auth_port),
       radius_accounting_port = COALESCE($17, radius_accounting_port),
       timezone_name = COALESCE($18, timezone_name),
       isolation_info_url = CASE WHEN $21 THEN $19 ELSE isolation_info_url END,
       is_active = COALESCE($20, is_active),
       updated_at = NOW()
     WHERE id = $1
     RETURNING ${publicColumns}`,
    [req.params.id, values.name, values.host, values.port, values.username,
      encrypted?.ciphertext, encrypted?.iv, encrypted?.authTag, values.useTls,
      values.timeoutSeconds, values.radiusServerAddress, values.radiusClientAddress,
      encryptedRadiusSecret?.ciphertext, encryptedRadiusSecret?.iv,
      encryptedRadiusSecret?.authTag, values.radiusAuthPort,
      values.radiusAccountingPort, values.timezoneName,
      values.isolationInfoUrl || null, values.isActive,
      Object.hasOwn(values, 'isolationInfoUrl')],
  );
  invalidateRouterCache();
  return res.json({ data: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    return res.status(400).json({ error: 'Invalid router ID' });
  }
  const assigned = await db.query(
    `SELECT COUNT(*)::int AS service_count
     FROM services WHERE router_id = $1`,
    [req.params.id],
  );
  const accounting = await db.query(
    'SELECT COUNT(*)::int AS session_count FROM radius_accounting_sessions WHERE router_id = $1',
    [req.params.id],
  );
  if (assigned.rows[0].service_count > 0 || accounting.rows[0].session_count > 0) {
    return res.status(409).json({
      error: 'Router masih memiliki layanan atau riwayat accounting; pindahkan data sebelum menghapus router',
      serviceCount: assigned.rows[0].service_count,
      accountingSessionCount: accounting.rows[0].session_count,
    });
  }
  const result = await db.query(
    'DELETE FROM mikrotik_routers WHERE id = $1 RETURNING id, name',
    [req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Router not found' });
  invalidateRouterCache();
  return res.json({ data: { ...result.rows[0], deleted: true } });
});

module.exports = router;
