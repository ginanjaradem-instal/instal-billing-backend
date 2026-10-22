const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enrichPppServices,
  publicRouterStatus,
  routerConfig,
} = require('../src/services/mikrotik');
const { decryptPassword, encryptPassword } = require('../src/services/router-credentials');

test('MikroTik passwords are encrypted with an authenticated key', () => {
  const env = { MIKROTIK_ENCRYPTION_KEY: 'a'.repeat(64) };
  const encrypted = encryptPassword('router-secret', env);
  assert.notEqual(encrypted.ciphertext, 'router-secret');
  assert.equal(decryptPassword(encrypted, env), 'router-secret');
  assert.throws(() => decryptPassword({ ...encrypted, authTag: '0'.repeat(32) }, env));
  assert.throws(() => encryptPassword('router-secret', {}), /MIKROTIK_ENCRYPTION_KEY/);
});

test('MikroTik connection is optional until configured', () => {
  assert.deepEqual(routerConfig({}), { status: 'unconfigured' });
  assert.equal(routerConfig({ MIKROTIK_HOST: '10.0.0.1' }).status, 'misconfigured');
});

test('MikroTik API defaults to API-SSL and chooses the matching default port', () => {
  const secure = routerConfig({
    MIKROTIK_HOST: '10.0.0.1',
    MIKROTIK_USER: 'billing-reader',
    MIKROTIK_PASSWORD: 'secret',
  });
  assert.equal(secure.status, 'configured');
  assert.equal(secure.options.tls, true);
  assert.equal(secure.options.port, 8729);

  const privateNetwork = routerConfig({
    MIKROTIK_HOST: '10.0.0.1',
    MIKROTIK_USER: 'billing-reader',
    MIKROTIK_PASSWORD: 'secret',
    MIKROTIK_TLS: 'false',
  });
  assert.equal(privateNetwork.options.tls, false);
  assert.equal(privateNetwork.options.port, 8728);
});

test('PPP sessions enrich services with live state, IP, caller-id, and uptime', () => {
  const services = enrichPppServices([
    { id: 'online', pppoe_username: 'cust-001' },
    { id: 'offline', pppoe_username: 'cust-002' },
  ], {
    status: 'connected',
    checkedAt: '2026-10-22T02:00:00.000Z',
    sessions: [{
      username: 'cust-001',
      ipAddress: '10.10.10.2',
      callerId: 'AA:BB:CC:DD:EE:FF',
      uptime: '1d2h3m',
      service: 'pppoe',
    }],
  });

  assert.equal(services[0].connection_status, 'connected');
  assert.equal(services[0].ip_address, '10.10.10.2');
  assert.equal(services[0].caller_id, 'AA:BB:CC:DD:EE:FF');
  assert.equal(services[0].connection_uptime, '1d2h3m');
  assert.equal(services[1].connection_status, 'disconnected');

  const customerService = enrichPppServices([
    { pppoeUsername: 'cust-001' },
  ], {
    status: 'connected',
    sessions: [{
      username: 'cust-001',
      ipAddress: '10.10.10.2',
      callerId: 'AA:BB:CC:DD:EE:FF',
      uptime: '1d2h3m',
      service: 'pppoe',
    }],
  });
  assert.equal(customerService[0].connection_status, 'connected');
});

test('connection state remains unknown when MikroTik cannot be queried', () => {
  const services = enrichPppServices([
    { pppoeUsername: 'cust-001' },
  ], { status: 'unavailable', sessions: [] });

  assert.equal(services[0].connection_status, 'unknown');
  assert.equal(services[0].ip_address, null);
  assert.deepEqual(publicRouterStatus({
    status: 'unavailable',
    checkedAt: '2026-10-22T02:00:00.000Z',
    message: 'Router unavailable',
    sessions: [],
  }), {
    status: 'unavailable',
    checkedAt: '2026-10-22T02:00:00.000Z',
    message: 'Router unavailable',
  });

  test('PPP sessions are matched by router as well as username', () => {
    const services = enrichPppServices([
      { id: 'first', router_id: 'router-a', pppoe_username: 'same-user' },
      { id: 'second', router_id: 'router-b', pppoe_username: 'same-user' },
      { id: 'unassigned', router_id: null, pppoe_username: 'same-user' },
    ], {
      status: 'partial',
      routers: [
        { id: 'router-a', status: 'connected' },
        { id: 'router-b', status: 'unavailable' },
      ],
      sessions: [{
        routerId: 'router-a',
        username: 'same-user',
        ipAddress: '10.10.10.2',
        callerId: 'AA:BB:CC:DD:EE:FF',
        uptime: '1d2h3m',
      }],
    });
    assert.equal(services[0].connection_status, 'connected');
    assert.equal(services[0].ip_address, '10.10.10.2');
    assert.equal(services[1].connection_status, 'unknown');
    assert.equal(services[2].connection_status, 'unknown');
  });
});
