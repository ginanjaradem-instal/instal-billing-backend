const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-local-tests';

const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ sub: 'admin-id', role: 'admin' }, process.env.JWT_SECRET);
const requestId = '6df2e7d8-7321-47c7-a7b2-4a9dc5dbec3c';

test('public installation form creates a request', async () => {
  const originalQuery = db.query;
  db.query = async (sql, values) => {
    assert.match(sql, /INSERT INTO installation_requests/);
    assert.deepEqual(values, [
      'Budi Santoso', 'budi@example.com', '081234567890',
      'Jl. Merdeka No. 10, Sumedang', 'InstaHome 50 Mbps',
    ]);
    return { rowCount: 1, rows: [{ id: requestId, status: 'new', created_at: '2026-10-22T00:00:00.000Z' }] };
  };
  try {
    const response = await request(createApp())
      .post('/api/public/installation-requests')
      .send({
        name: 'Budi Santoso',
        email: 'budi@example.com',
        phone: '081234567890',
        address: 'Jl. Merdeka No. 10, Sumedang',
        preferredPlan: 'InstaHome 50 Mbps',
      });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.requestNumber, requestId);
  } finally {
    db.query = originalQuery;
  }
});

test('public trouble report validates and saves customer-submitted details', async () => {
  const originalQuery = db.query;
  db.query = async (sql, values) => {
    assert.match(sql, /INSERT INTO customer_trouble_reports/);
    assert.deepEqual(values, [
      'Ani Putri', '081234567890', 'CUST-0001', 'slow_connection',
      'Internet lambat', 'Koneksi terasa lambat sejak pagi hari.',
    ]);
    return { rowCount: 1, rows: [{ id: requestId, status: 'open', created_at: '2026-10-22T00:00:00.000Z' }] };
  };
  try {
    const response = await request(createApp())
      .post('/api/public/trouble-reports')
      .send({
        name: 'Ani Putri',
        phone: '081234567890',
        customerCode: 'CUST-0001',
        category: 'slow_connection',
        subject: 'Internet lambat',
        description: 'Koneksi terasa lambat sejak pagi hari.',
      });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.reportNumber, requestId);
  } finally {
    db.query = originalQuery;
  }
});

test('public service request endpoints reject invalid form data', async () => {
  const app = createApp();
  const installation = await request(app)
    .post('/api/public/installation-requests')
    .send({ name: 'B', phone: '123', address: 'singkat' });
  const trouble = await request(app)
    .post('/api/public/trouble-reports')
    .send({
      name: 'Ani Putri',
      phone: '081234567890',
      category: 'unknown',
      subject: 'Koneksi',
      description: 'Koneksi lambat dari pagi hari.',
    });
  assert.equal(installation.status, 400);
  assert.equal(trouble.status, 400);
});

test('request queues require authentication and accept staff access', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    assert.match(sql, /FROM installation_requests/);
    return { rowCount: 0, rows: [] };
  };
  try {
    const app = createApp();
    const unauthenticated = await request(app).get('/api/requests/installation');
    const staff = await request(app)
      .get('/api/requests/installation')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(unauthenticated.status, 401);
    assert.equal(staff.status, 200);
    assert.deepEqual(staff.body.data, []);
  } finally {
    db.query = originalQuery;
  }
});

test('staff can update a request status and notes', async () => {
  const originalQuery = db.query;
  db.query = async (sql, values) => {
    assert.match(sql, /UPDATE customer_trouble_reports/);
    assert.deepEqual(values, [requestId, 'in_progress', 'Teknisi sedang menuju lokasi.']);
    return {
      rowCount: 1,
      rows: [{
        id: requestId,
        status: 'in_progress',
        staff_notes: 'Teknisi sedang menuju lokasi.',
        updated_at: '2026-10-22T00:00:00.000Z',
      }],
    };
  };
  try {
    const response = await request(createApp())
      .patch(`/api/requests/trouble/${requestId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress', staffNotes: 'Teknisi sedang menuju lokasi.' });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'in_progress');
  } finally {
    db.query = originalQuery;
  }
});

test('request status updates validate type, ID, and status', async () => {
  const app = createApp();
  const invalidType = await request(app)
    .get('/api/requests/toString')
    .set('Authorization', `Bearer ${adminToken}`);
  const invalidId = await request(app)
    .patch('/api/requests/installation/not-a-uuid')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'approved' });
  const invalidStatus = await request(app)
    .patch(`/api/requests/installation/${requestId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'open' });
  assert.equal(invalidType.status, 404);
  assert.equal(invalidId.status, 400);
  assert.equal(invalidStatus.status, 400);
});
