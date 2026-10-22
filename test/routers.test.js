const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { decryptPassword, encryptPassword } = require('../src/services/router-credentials');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-local-tests';

test('admin can list routers with configured RADIUS ports', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    assert.match(sql, /radius_auth_port/);
    assert.match(sql, /radius_accounting_port/);
    return {
      rowCount: 1,
      rows: [{
        id: '97058b76-736b-4a9b-a9af-6767f54d9993',
        name: 'Router Sumedang',
        radius_auth_port: 1812,
        radius_accounting_port: 1813,
        is_active: true,
      }],
    };
  };
  try {
    const token = jwt.sign({ sub: 'admin-id', role: 'admin' }, process.env.JWT_SECRET);
    const response = await request(createApp())
      .get('/api/routers')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data[0].radius_auth_port, 1812);
    assert.equal(response.body.data[0].radius_accounting_port, 1813);
  } finally {
    db.query = originalQuery;
  }
});

test('admin can add a MikroTik router without returning its password', async () => {
  const originalQuery = db.query;
  const previousKey = process.env.MIKROTIK_ENCRYPTION_KEY;
  const encryptionKey = 'ab'.repeat(32);
  process.env.MIKROTIK_ENCRYPTION_KEY = encryptionKey;
  db.query = async (sql, values) => {
    assert.match(sql, /password_ciphertext/);
    assert.notEqual(values[4], 'router-password');
    assert.equal(decryptPassword({
      ciphertext: values[4],
      iv: values[5],
      authTag: values[6],
    }, { MIKROTIK_ENCRYPTION_KEY: encryptionKey }), 'router-password');
    assert.equal(decryptPassword({
      ciphertext: values[11],
      iv: values[12],
      authTag: values[13],
    }, { MIKROTIK_ENCRYPTION_KEY: encryptionKey }), 'radius-shared-secret-123');
    return {
      rowCount: 1,
      rows: [{
        id: '97058b76-736b-4a9b-a9af-6767f54d9993',
        name: 'Router Sumedang',
        host: '192.168.88.1',
        port: 8729,
        username: 'billing-reader',
        use_tls: true,
        timeout_seconds: 5,
        is_active: true,
      }],
    };
  };

  try {
    const token = jwt.sign({ sub: 'admin-id', role: 'admin' }, process.env.JWT_SECRET);
    const response = await request(createApp())
      .post('/api/routers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Router Sumedang',
        host: '192.168.88.1',
        port: 8729,
        username: 'billing-reader',
        password: 'router-password',
        useTls: true,
        timeoutSeconds: 5,
        radiusServerAddress: '192.0.2.20',
        radiusClientAddress: '192.0.2.1',
        radiusAuthPort: 1812,
        radiusAccountingPort: 1813,
        radiusSecret: 'radius-shared-secret-123',
        timezoneName: 'Asia/Jakarta',
        isolationInfoUrl: '',
      });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.name, 'Router Sumedang');
    assert.doesNotMatch(JSON.stringify(response.body), /router-password|password_ciphertext/);
  } finally {
    db.query = originalQuery;
    if (previousKey === undefined) delete process.env.MIKROTIK_ENCRYPTION_KEY;
    else process.env.MIKROTIK_ENCRYPTION_KEY = previousKey;
  }
});

test('admin can generate a RouterOS script without exposing credentials in router list', async () => {
  const originalQuery = db.query;
  const previousKey = process.env.MIKROTIK_ENCRYPTION_KEY;
  const encryptionKey = 'ef'.repeat(32);
  process.env.MIKROTIK_ENCRYPTION_KEY = encryptionKey;
  const apiPassword = encryptPassword('api-password', {
    MIKROTIK_ENCRYPTION_KEY: encryptionKey,
  });
  const radiusSecret = encryptPassword('radius-shared-secret', {
    MIKROTIK_ENCRYPTION_KEY: encryptionKey,
  });
  db.query = async (sql) => {
    if (sql.includes('FROM mikrotik_routers WHERE id = $1 AND is_active')) {
      return {
        rowCount: 1,
        rows: [{
          id: '97058b76-736b-4a9b-a9af-6767f54d9993',
          name: 'Router Sumedang',
          username: 'billing-reader',
          password_ciphertext: apiPassword.ciphertext,
          password_iv: apiPassword.iv,
          password_auth_tag: apiPassword.authTag,
          radius_server_address: '192.0.2.20',
          radius_client_address: '192.0.2.1',
          radius_secret_ciphertext: radiusSecret.ciphertext,
          radius_secret_iv: radiusSecret.iv,
          radius_secret_auth_tag: radiusSecret.authTag,
          radius_auth_port: 1812,
          radius_accounting_port: 1813,
          timezone_name: 'Asia/Jakarta',
          isolation_info_url: null,
        }],
      };
    }
    return {
      rowCount: 1,
      rows: [{
        id: '97058b76-736b-4a9b-a9af-6767f54d9993',
        name: 'Router Sumedang',
        host: '192.0.2.1',
        port: 8729,
        username: 'billing-reader',
        use_tls: true,
        timeout_seconds: 5,
        radius_server_address: '192.0.2.20',
        radius_client_address: '192.0.2.1',
        radius_auth_port: 1812,
        radius_accounting_port: 1813,
        timezone_name: 'Asia/Jakarta',
        isolation_info_url: null,
        is_active: true,
      }],
    };
  };

  try {
    const token = jwt.sign({ sub: 'admin-id', role: 'admin' }, process.env.JWT_SECRET);
    const response = await request(createApp())
      .post('/api/routers/97058b76-736b-4a9b-a9af-6767f54d9993/script')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.match(response.body.data.script, /use-radius=yes accounting=yes interim-update=5m/);
    assert.match(response.body.data.script, /authentication-port=1812 accounting-port=1813/);
    assert.match(response.body.data.script, /api-password/);
    assert.match(response.body.data.script, /radius-shared-secret/);
    const list = await request(createApp())
      .get('/api/routers')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.doesNotMatch(JSON.stringify(list.body), /password_ciphertext|radius_secret|api-password|radius-shared-secret/);
  } finally {
    db.query = originalQuery;
    if (previousKey === undefined) delete process.env.MIKROTIK_ENCRYPTION_KEY;
    else process.env.MIKROTIK_ENCRYPTION_KEY = previousKey;
  }
});
