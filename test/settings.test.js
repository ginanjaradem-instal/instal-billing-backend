const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
const { createApp } = require('../src/app');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-local-tests';

const token = jwt.sign({ sub: 'admin-id', role: 'admin' }, process.env.JWT_SECRET);
const settings = {
  company_name: 'InstaLink',
  company_address: 'Jl. Merdeka No. 1',
  company_phone: '081234567890',
  invoice_description: 'Pembayaran layanan internet bulanan',
  bank_count: 2,
  bank_accounts: [
    { bankName: 'BCA', accountName: 'PT InstaLink', accountNumber: '1234567890' },
    { bankName: 'Mandiri', accountName: 'PT InstaLink', accountNumber: '9876543210' },
  ],
  invoice_reminder_days: 7,
  updated_at: '2026-10-22T00:00:00.000Z',
};

test('admin can read saved general settings', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    assert.match(sql, /FROM general_settings WHERE singleton = TRUE/);
    return { rowCount: 1, rows: [settings] };
  };
  try {
    const response = await request(createApp())
      .get('/api/settings/general')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.companyName, 'InstaLink');
    assert.equal(response.body.data.bankAccounts.length, 2);
    assert.equal(response.body.data.invoiceReminderDays, 7);
  } finally {
    db.query = originalQuery;
  }
});

test('admin can save general settings and both bank accounts', async () => {
  const originalQuery = db.query;
  db.query = async (sql, values) => {
    assert.match(sql, /ON CONFLICT \(singleton\) DO UPDATE/);
    assert.equal(values[0], 'InstaLink');
    assert.equal(values[4], 2);
    assert.deepEqual(JSON.parse(values[5]), settings.bank_accounts);
    assert.equal(values[6], 7);
    return { rowCount: 1, rows: [settings] };
  };
  try {
    const response = await request(createApp())
      .put('/api/settings/general')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyName: 'InstaLink',
        companyAddress: 'Jl. Merdeka No. 1',
        companyPhone: '081234567890',
        invoiceDescription: 'Pembayaran layanan internet bulanan',
        bankCount: 2,
        bankAccounts: settings.bank_accounts,
        invoiceReminderDays: 7,
      });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.bankCount, 2);
    assert.equal(response.body.data.bankAccounts[1].bankName, 'Mandiri');
  } finally {
    db.query = originalQuery;
  }
});

test('general settings reject a bank account count mismatch', async () => {
  const response = await request(createApp())
    .put('/api/settings/general')
    .set('Authorization', `Bearer ${token}`)
    .send({
      companyName: 'InstaLink',
      companyAddress: 'Jl. Merdeka No. 1',
      companyPhone: '081234567890',
      invoiceDescription: '',
      bankCount: 2,
      bankAccounts: [settings.bank_accounts[0]],
      invoiceReminderDays: 3,
    });
  assert.equal(response.status, 400);
});

test('admin can preview saved invoice logos beside centered company details', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    assert.match(sql, /invoice_design_settings/);
    return {
      rowCount: 1,
      rows: [{
        company_name: 'InstaLink',
        company_address: 'Jl. Merdeka',
        logo_left: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        logo_left_mime: 'image/png',
        logo_right: null,
        logo_right_mime: null,
        updated_at: settings.updated_at,
      }],
    };
  };
  try {
    const response = await request(createApp())
      .get('/api/settings/invoice')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.match(response.body.data.logoLeft, /^data:image\/png;base64,/);
    assert.equal(response.body.data.logoRight, null);
    assert.equal(response.body.data.companyName, 'InstaLink');
  } finally {
    db.query = originalQuery;
  }
});

test('admin can upload a logo with a valid image signature', async () => {
  const originalQuery = db.query;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  db.query = async (sql, values) => {
    assert.match(sql, /SET logo_left = \$1, logo_left_mime = \$2/);
    assert.deepEqual(values[0], png);
    assert.equal(values[1], 'image/png');
    return { rowCount: 1, rows: [{ updated_at: settings.updated_at }] };
  };
  try {
    const response = await request(createApp())
      .put('/api/settings/invoice/logo/left')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .send(png);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.side, 'left');
  } finally {
    db.query = originalQuery;
  }
});

test('invoice logo upload rejects mismatched and unsupported image content', async () => {
  const app = createApp();
  const mismatch = await request(app)
    .put('/api/settings/invoice/logo/right')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/png')
    .send(Buffer.from('not a png'));
  assert.equal(mismatch.status, 400);

  const unsupported = await request(app)
    .put('/api/settings/invoice/logo/right')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/gif')
    .send(Buffer.from('GIF89a'));
  assert.equal(unsupported.status, 400);
});
