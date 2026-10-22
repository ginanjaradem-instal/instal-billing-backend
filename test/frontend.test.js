const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const request = require('supertest');
const { createApp } = require('../src/app');

const featureScripts = [
  ['dashboard', 'dashboard'],
  ['pelanggan', 'customers'],
  ['plans', 'plans'],
  ['services', 'services'],
  ['invoices', 'invoices'],
  ['tickets', 'tickets'],
  ['requests', 'requests'],
  ['routers', 'routers'],
  ['settings', 'settings'],
  ['users', 'users'],
  ['actions', 'actions'],
  ['interactions', 'interactions'],
];

test('admin page loads feature scripts before the app orchestrator', async () => {
  const response = await request(createApp()).get('/admin');
  assert.equal(response.status, 200);
  const scripts = [...response.text.matchAll(/<script src="([^"]+)" defer><\/script>/g)]
    .map((match) => match[1]);

  for (const [filename] of featureScripts) {
    assert.ok(scripts.includes(`/js/${filename}.js`), `${filename}.js is loaded from /js`);
    assert.ok(
      scripts.indexOf(`/js/${filename}.js`) < scripts.indexOf('/js/app.js'),
      `${filename}.js loads before app.js`,
    );
  }
});

test('admin navigation includes the public service request queues', async () => {
  const response = await request(createApp()).get('/admin');
  assert.equal(response.status, 200);
  assert.match(response.text, /data-page="installation-requests"[^>]*>[\s\S]*?Ajuan pemasangan/);
  assert.match(response.text, /data-page="trouble-reports"[^>]*>[\s\S]*?Laporan gangguan/);
});

test('admin feature scripts are served and register their feature namespace', async () => {
  for (const [filename, feature] of featureScripts) {
    const response = await request(createApp()).get(`/js/${filename}.js`);
    assert.equal(response.status, 200, `${filename}.js is served`);
    assert.match(response.text, new RegExp(`features\\.${feature}\\s*=`));
  }
});

test('all settings pages render with shared navigation labels and descriptions', async () => {
  const app = { features: {} };
  const settingsScript = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'settings.js'),
    'utf8',
  );
  vm.runInNewContext(settingsScript, { window: { InstaLinkAdmin: app } });

  const labels = {
    'settings-general': 'Pengaturan Umum',
    'settings-invoice': 'Invoice',
    'settings-email': 'Setting Email',
    'settings-whatsapp': 'Whatsapp API',
    'settings-api': 'Setting API',
    'settings-payment': 'Payment Gateway',
  };
  const settingsPages = Object.fromEntries(
    Object.keys(labels).map((page) => [page, `Deskripsi ${labels[page]}`]),
  );
  const rendered = [];
  const ctx = {
    labels,
    settingsPages,
    state: {},
    api: async (url) => ({
      data: url.endsWith('/invoice')
        ? { companyName: 'InstaLink', companyAddress: 'Alamat', logoLeft: null, logoRight: null }
        : {
          companyName: 'InstaLink',
          companyAddress: 'Alamat',
          companyPhone: '081234567890',
          invoiceDescription: '',
          bankCount: 1,
          bankAccounts: [],
          invoiceReminderDays: 3,
        },
    }),
    escapeHtml: (value) => String(value ?? ''),
    pageHeading: (title, description) => `${title}: ${description}`,
    setPage: (page, html) => rendered.push({ page, html }),
  };

  for (const [page, label] of Object.entries(labels)) {
    await app.features.settings.renderSettings(ctx, page);
    const result = rendered.at(-1);
    assert.equal(result.page, page);
    assert.ok(result.html.includes(label));
    assert.ok(result.html.includes(settingsPages[page]));
  }

  assert.ok(rendered[0].html.includes('update-general-settings'));
  assert.ok(rendered[1].html.includes('Pratinjau header invoice'));
});
