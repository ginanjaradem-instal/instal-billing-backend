const crypto = require('node:crypto');
const dgram = require('node:dgram');
const radius = require('radius');
const db = require('../db');
const { decryptPassword } = require('./router-credentials');

function normalizeAddress(address) {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticatePassword(packet, password) {
  const attributes = packet.attributes;
  if (typeof attributes['User-Password'] === 'string') {
    return safeEqual(attributes['User-Password'], password);
  }
  const chapPassword = attributes['CHAP-Password'];
  if (!Buffer.isBuffer(chapPassword) || chapPassword.length !== 17) return false;
  const challenge = attributes['CHAP-Challenge'] || packet.authenticator;
  if (!Buffer.isBuffer(challenge)) return false;
  const expected = crypto.createHash('md5')
    .update(chapPassword.subarray(0, 1))
    .update(password)
    .update(challenge)
    .digest();
  return safeEqual(chapPassword.subarray(1), expected);
}

function integerAttribute(attributes, name) {
  const value = attributes[name];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function addressAttribute(attributes, name) {
  const value = attributes[name];
  return typeof value === 'string' && value ? value : null;
}

function stringAttribute(attributes, name) {
  const value = attributes[name];
  return typeof value === 'string' && value ? value : null;
}

async function findRadiusClient(address) {
  const result = await db.query(
    `SELECT id, radius_secret_ciphertext, radius_secret_iv, radius_secret_auth_tag
     FROM mikrotik_routers
     WHERE is_active AND radius_client_address = $1
       AND radius_secret_ciphertext IS NOT NULL`,
    [normalizeAddress(address)],
  );
  if (result.rowCount !== 1) return null;
  const client = result.rows[0];
  return {
    id: client.id,
    secret: decryptPassword({
      ciphertext: client.radius_secret_ciphertext,
      iv: client.radius_secret_iv,
      authTag: client.radius_secret_auth_tag,
    }),
  };
}

async function handleAccessRequest(packet, routerId) {
  const username = packet.attributes['User-Name'];
  if (typeof username !== 'string' || !username) return 'Access-Reject';
  const result = await db.query(
    `SELECT s.id, s.pppoe_password_ciphertext, s.pppoe_password_iv,
            s.pppoe_password_auth_tag
     FROM services s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.router_id = $1 AND s.pppoe_username = $2
       AND s.status = 'active' AND c.status = 'active'
       AND s.pppoe_password_ciphertext IS NOT NULL`,
    [routerId, username],
  );
  if (!result.rowCount) return 'Access-Reject';
  const service = result.rows[0];
  const password = decryptPassword({
    ciphertext: service.pppoe_password_ciphertext,
    iv: service.pppoe_password_iv,
    authTag: service.pppoe_password_auth_tag,
  });
  return authenticatePassword(packet, password) ? 'Access-Accept' : 'Access-Reject';
}

async function handleAccountingRequest(packet, routerId) {
  const attributes = packet.attributes;
  const username = attributes['User-Name'];
  const sessionId = attributes['Acct-Session-Id'];
  const statusType = attributes['Acct-Status-Type'];
  if (typeof username !== 'string' || typeof sessionId !== 'string' || !sessionId
    || !['Start', 'Interim-Update', 'Stop'].includes(statusType)) {
    return false;
  }
  const serviceResult = await db.query(
    `SELECT s.id FROM services s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.router_id = $1 AND s.pppoe_username = $2 AND c.status = 'active'
     ORDER BY (s.status = 'active') DESC, s.created_at DESC LIMIT 1`,
    [routerId, username],
  );
  const serviceId = serviceResult.rows[0]?.id || null;
  const ended = statusType === 'Stop';
  const started = statusType === 'Start';
  await db.query(
    `INSERT INTO radius_accounting_sessions (
       router_id, accounting_session_id, service_id, username, framed_ip_address,
       status, started_at, last_accounting_at, stopped_at, session_seconds,
       input_octets, output_octets, terminate_cause
     )
     VALUES (
       $1, $2, $3, $4, $5::inet,
       $6, CASE WHEN $7 THEN NOW() END, NOW(),
       CASE WHEN $8 THEN NOW() END, $9, $10, $11, $12
     )
     ON CONFLICT (router_id, accounting_session_id) DO UPDATE SET
       service_id = EXCLUDED.service_id,
       username = EXCLUDED.username,
       framed_ip_address = COALESCE(EXCLUDED.framed_ip_address, radius_accounting_sessions.framed_ip_address),
       status = EXCLUDED.status,
       started_at = CASE WHEN $7 THEN NOW() ELSE COALESCE(radius_accounting_sessions.started_at, EXCLUDED.started_at) END,
       last_accounting_at = NOW(),
       stopped_at = CASE WHEN $8 THEN NOW() ELSE radius_accounting_sessions.stopped_at END,
       session_seconds = COALESCE(EXCLUDED.session_seconds, radius_accounting_sessions.session_seconds),
       input_octets = COALESCE(EXCLUDED.input_octets, radius_accounting_sessions.input_octets),
       output_octets = COALESCE(EXCLUDED.output_octets, radius_accounting_sessions.output_octets),
       terminate_cause = COALESCE(EXCLUDED.terminate_cause, radius_accounting_sessions.terminate_cause)`,
    [
      routerId, sessionId, serviceId, username,
      addressAttribute(attributes, 'Framed-IP-Address'),
      ended ? 'stopped' : 'active', started, ended,
      integerAttribute(attributes, 'Acct-Session-Time'),
      integerAttribute(attributes, 'Acct-Input-Octets'),
      integerAttribute(attributes, 'Acct-Output-Octets'),
      stringAttribute(attributes, 'Acct-Terminate-Cause'),
    ],
  );
  return true;
}

async function processPacket(message, remoteAddress, kind) {
  let client;
  try {
    client = await findRadiusClient(remoteAddress);
    if (!client) return null;
    const packet = radius.decode({ packet: message, secret: client.secret });
    let code;
    if (kind === 'authentication' && packet.code === 'Access-Request') {
      code = await handleAccessRequest(packet, client.id);
    } else if (kind === 'accounting' && packet.code === 'Accounting-Request') {
      const accepted = await handleAccountingRequest(packet, client.id);
      if (!accepted) return null;
      code = 'Accounting-Response';
    } else {
      return null;
    }
    return radius.encode_response({ packet, code, secret: client.secret });
  } catch (error) {
    console.error('RADIUS request rejected:', error.message);
    return null;
  }
}

function createRadiusServer({ authPort, accountingPort, address = '0.0.0.0' }) {
  const sockets = [];
  let closing = false;
  const listeners = [
    { kind: 'authentication', port: authPort },
    { kind: 'accounting', port: accountingPort },
  ];
  const start = () => Promise.all(listeners.map(({ kind, port }) => new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    sockets.push(socket);
    const onError = (error) => {
      socket.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      socket.removeListener('error', onError);
      resolve();
    };
    socket.once('error', onError);
    socket.once('listening', onListening);
    socket.on('error', (error) => {
      if (!closing) console.error(`RADIUS ${kind} socket error:`, error.message);
    });
    socket.on('message', (message, remote) => {
      processPacket(message, remote.address, kind)
        .then((response) => {
          if (response) socket.send(response, remote.port, remote.address);
        })
        .catch((error) => console.error('RADIUS packet processing failed:', error.message));
    });
    socket.bind(port, address);
  })));
  const close = () => Promise.all(sockets.map((socket) => new Promise((resolve) => {
    try {
      if (!socket.address().port) return resolve();
      socket.close(resolve);
    } catch {
      resolve();
    }
  })));
  return { start, close };
}

module.exports = {
  authenticatePassword,
  createRadiusServer,
  handleAccountingRequest,
  processPacket,
};
