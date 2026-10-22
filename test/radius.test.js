const test = require('node:test');
const assert = require('node:assert/strict');
const radius = require('radius');
const db = require('../src/db');
const { encryptPassword } = require('../src/services/router-credentials');
const { createRadiusServer, processPacket } = require('../src/services/radius');

const encryptionKey = 'cd'.repeat(32);
const sharedSecret = 'router-radius-secret';
const encryptedSecret = encryptPassword(sharedSecret, {
  MIKROTIK_ENCRYPTION_KEY: encryptionKey,
});
const encryptedPppoePassword = encryptPassword('pppoe-password', {
  MIKROTIK_ENCRYPTION_KEY: encryptionKey,
});

test('RADIUS accepts valid PPPoE PAP credentials from a configured router', async () => {
  const originalQuery = db.query;
  process.env.MIKROTIK_ENCRYPTION_KEY = encryptionKey;
  db.query = async (sql, values) => {
    if (sql.includes('FROM mikrotik_routers')) {
      if (values[0] !== '192.0.2.1') return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          id: '97058b76-736b-4a9b-a9af-6767f54d9993',
          radius_secret_ciphertext: encryptedSecret.ciphertext,
          radius_secret_iv: encryptedSecret.iv,
          radius_secret_auth_tag: encryptedSecret.authTag,
        }],
      };
    }
    return {
      rowCount: 1,
      rows: [{
        id: '8a6ef135-97f8-430e-8b22-acd4f640a8d4',
        pppoe_password_ciphertext: encryptedPppoePassword.ciphertext,
        pppoe_password_iv: encryptedPppoePassword.iv,
        pppoe_password_auth_tag: encryptedPppoePassword.authTag,
      }],
    };
  };
  try {
    const request = radius.encode({
      code: 'Access-Request',
      secret: sharedSecret,
      attributes: [
        ['User-Name', 'cust-001'],
        ['User-Password', 'pppoe-password'],
      ],
    });
    const response = await processPacket(request, '192.0.2.1', 'authentication');
    assert.ok(response);
    const packet = radius.decode({ packet: response, secret: sharedSecret });
    assert.equal(packet.code, 'Access-Accept');
  } finally {
    db.query = originalQuery;
  }
});

test('RADIUS verifies PPP CHAP challenge responses', async () => {
  const originalQuery = db.query;
  process.env.MIKROTIK_ENCRYPTION_KEY = encryptionKey;
  db.query = async (sql, values) => {
    if (sql.includes('FROM mikrotik_routers')) {
      if (values[0] !== '192.0.2.1') return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          id: '97058b76-736b-4a9b-a9af-6767f54d9993',
          radius_secret_ciphertext: encryptedSecret.ciphertext,
          radius_secret_iv: encryptedSecret.iv,
          radius_secret_auth_tag: encryptedSecret.authTag,
        }],
      };
    }
    return {
      rowCount: 1,
      rows: [{
        id: '8a6ef135-97f8-430e-8b22-acd4f640a8d4',
        pppoe_password_ciphertext: encryptedPppoePassword.ciphertext,
        pppoe_password_iv: encryptedPppoePassword.iv,
        pppoe_password_auth_tag: encryptedPppoePassword.authTag,
      }],
    };
  };
  try {
    const chapId = Buffer.from([7]);
    const challenge = Buffer.from('aabbccddeeff00112233445566778899', 'hex');
    const responseDigest = require('node:crypto').createHash('md5')
      .update(chapId)
      .update('pppoe-password')
      .update(challenge)
      .digest();
    const request = radius.encode({
      code: 'Access-Request',
      secret: sharedSecret,
      attributes: [
        ['User-Name', 'cust-001'],
        ['CHAP-Password', Buffer.concat([chapId, responseDigest])],
        ['CHAP-Challenge', challenge],
      ],
    });
    const response = await processPacket(request, '192.0.2.1', 'authentication');
    assert.equal(radius.decode({ packet: response, secret: sharedSecret }).code, 'Access-Accept');
  } finally {
    db.query = originalQuery;
  }
});

test('RADIUS rejects invalid credentials and unknown clients', async () => {
  const originalQuery = db.query;
  process.env.MIKROTIK_ENCRYPTION_KEY = encryptionKey;
  db.query = async (sql, values) => {
    if (sql.includes('FROM mikrotik_routers')) {
      if (values[0] !== '192.0.2.1') return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [{
          id: '97058b76-736b-4a9b-a9af-6767f54d9993',
          radius_secret_ciphertext: encryptedSecret.ciphertext,
          radius_secret_iv: encryptedSecret.iv,
          radius_secret_auth_tag: encryptedSecret.authTag,
        }],
      };
    }
    return {
      rowCount: 1,
      rows: [{
        id: '8a6ef135-97f8-430e-8b22-acd4f640a8d4',
        pppoe_password_ciphertext: encryptedPppoePassword.ciphertext,
        pppoe_password_iv: encryptedPppoePassword.iv,
        pppoe_password_auth_tag: encryptedPppoePassword.authTag,
      }],
    };
  };
  try {
    const request = radius.encode({
      code: 'Access-Request',
      secret: sharedSecret,
      attributes: [
        ['User-Name', 'cust-001'],
        ['User-Password', 'incorrect-password'],
      ],
    });
    const response = await processPacket(request, '192.0.2.1', 'authentication');
    assert.equal(radius.decode({ packet: response, secret: sharedSecret }).code, 'Access-Reject');
    assert.equal(await processPacket(request, '192.0.2.99', 'authentication'), null);
  } finally {
    db.query = originalQuery;
  }
});

test('RADIUS accounting requests persist session updates and return acknowledgements', async () => {
  const originalQuery = db.query;
  process.env.MIKROTIK_ENCRYPTION_KEY = encryptionKey;
  const statements = [];
  db.query = async (sql, values) => {
    statements.push({ sql, values });
    if (sql.includes('FROM mikrotik_routers')) {
      return {
        rowCount: 1,
        rows: [{
          id: '97058b76-736b-4a9b-a9af-6767f54d9993',
          radius_secret_ciphertext: encryptedSecret.ciphertext,
          radius_secret_iv: encryptedSecret.iv,
          radius_secret_auth_tag: encryptedSecret.authTag,
        }],
      };
    }
    if (sql.includes('FROM services s')) {
      return { rowCount: 1, rows: [{ id: '8a6ef135-97f8-430e-8b22-acd4f640a8d4' }] };
    }
    return { rowCount: 1, rows: [] };
  };
  try {
    const request = radius.encode({
      code: 'Accounting-Request',
      secret: sharedSecret,
      attributes: [
        ['User-Name', 'cust-001'],
        ['Acct-Session-Id', 'session-100'],
        ['Acct-Status-Type', 'Start'],
        ['Framed-IP-Address', '10.10.10.20'],
      ],
    });
    const response = await processPacket(request, '192.0.2.1', 'accounting');
    assert.ok(response);
    assert.equal(radius.decode({ packet: response, secret: sharedSecret }).code, 'Accounting-Response');
    assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO radius_accounting_sessions')));
  } finally {
    db.query = originalQuery;
  }
});

test('RADIUS UDP listeners bind and close cleanly', async () => {
  const server = createRadiusServer({
    authPort: 0,
    accountingPort: 0,
    address: '127.0.0.1',
  });
  await server.start();
  await server.close();
});
