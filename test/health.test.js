const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-local-tests';
const { createApp } = require('../src/app');
const { isNearRoute, parseNetwork } = require('../src/services/coverage');

async function getAdminScripts(app) {
  const html = await request(app).get('/admin');
  const paths = [...html.text.matchAll(/<script src="([^"]+)" defer><\/script>/g)]
    .map((match) => match[1]);
  const scripts = await Promise.all(paths.map((scriptPath) => request(app).get(scriptPath)));
  return { status: html.status, text: scripts.map((script) => script.text).join('\n') };
}

test('GET /health reports the API is alive', async () => {
  const response = await request(createApp()).get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test('GET / serves the public landing page without requiring a database connection', async () => {
  const response = await request(createApp()).get('/');
  assert.equal(response.status, 200);
  assert.match(response.text, /<title>InstaLink/);
  assert.match(response.text, /\/landing\.js/);
  assert.match(response.text, /\/assets\/reference\/logo\.png/);
  assert.match(response.text, /\/pages\.css/);
  assert.doesNotMatch(response.text, /class="brand-mark">O</);
  assert.match(response.headers['content-type'], /text\/html/);
});

test('all public marketing pages serve the shared InstaLink site shell', async () => {
  const app = createApp();
  const paths = [
    '/pasang-wifi-sumedang',
    '/pasang-wifi-sumedang-murah',
    '/galeri',
    '/berita',
    '/bayar',
    '/kontak',
    '/corporate',
  ];
  const responses = await Promise.all(paths.map((path) => request(app).get(path)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.match(response.text, /id="page-content"/);
    assert.match(response.text, /class="site-footer"/);
    assert.match(response.text, /aria-label="Navigasi footer"/);
    assert.match(response.text, /aria-label="Informasi InstaLink"/);
    assert.match(response.text, /sindi@instalink\.id/);
    assert.match(response.headers['content-type'], /text\/html/);
  }
});

test('corporate profile includes company background, vision, mission, and services', async () => {
  const response = await request(createApp()).get('/js/landing.js');
  assert.equal(response.status, 200);
  assert.match(response.text, /Company Profile/);
  assert.match(response.text, /PT Sinergi Infrastruktur Digital/);
  assert.match(response.text, /corporate-vision/);
  assert.match(response.text, /MISI KAMI/);
  assert.match(response.text, /Dedicated Internet & leased line/);
  assert.match(response.text, /Managed IT & security/);
  assert.match(response.text, /KESIAPAN & DAMPAK SOSIAL/);
});

test('public payment verification validates required identifiers without requiring login', async () => {
  const response = await request(createApp())
    .post('/api/public/payment-link')
    .send({ invoiceNumber: '', customerCode: '' });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /invoice number and customer code/);
});

test('public payment verification limits repeated attempts from one IP', async () => {
  const app = createApp();
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await request(app)
      .post('/api/public/payment-link')
      .send({ invoiceNumber: '', customerCode: '' });
  }
  assert.equal(response.status, 429);
});

test('coverage checker validates coordinates and keeps the KML file private', async () => {
  const app = createApp();
  const invalidResponse = await request(app)
    .post('/api/public/coverage-check')
    .send({ latitude: 91, longitude: 181 });
  assert.equal(invalidResponse.status, 400);

  const privateMapResponse = await request(app).get('/assets/titik-pelanggan.kml');
  assert.equal(privateMapResponse.status, 404);
});

test('interactive map library is served locally and tile access is allowed by CSP', async () => {
  const app = createApp();
  const [script, style, image, page] = await Promise.all([
    request(app).get('/vendor/leaflet/leaflet.js'),
    request(app).get('/vendor/leaflet/leaflet.css'),
    request(app).get('/vendor/leaflet/images/marker-icon.png'),
    request(app).get('/'),
  ]);
  assert.equal(script.status, 200);
  assert.equal(style.status, 200);
  assert.equal(image.status, 200);
  assert.match(page.headers['content-security-policy'], /https:\/\/tile\.openstreetmap\.org/);
  assert.match(page.text, /\/vendor\/leaflet\/leaflet\.css/);
  assert.match(page.text, /\/vendor\/leaflet\/leaflet\.js/);
});

test('coverage detection measures distance to cable routes and ignores customer points', () => {
  const network = parseNetwork(`
    <kml><Placemark><Point><coordinates>106.02,-6,0</coordinates></Point></Placemark>
    <Placemark><LineString><coordinates>106,-6,0 106.001,-6,0</coordinates></LineString></Placemark></kml>
  `);
  assert.equal(network.routes.length, 1);
  assert.equal(isNearRoute(106.0001, -6, network.routes), true);
  assert.equal(isNearRoute(106.01, -6, network.routes), false);
  assert.equal(isNearRoute(106.02, -6, network.routes), false);
});

test('GET /admin serves the existing dashboard login page', async () => {
  const response = await request(createApp()).get('/admin');
  assert.equal(response.status, 200);
  assert.match(response.text, /Billing & CRM/);
  assert.match(response.text, /id="login-form"/);
  assert.match(response.text, /data-page="routers"/);
  assert.match(response.text, /\/js\/app\.js/);
  assert.match(response.headers['content-type'], /text\/html/);
});

test('admin dashboard includes the settings dropdown and all requested sections', async () => {
  const app = createApp();
  const html = await request(app).get('/admin');
  const script = await request(app).get('/js/settings.js');
  const css = await request(app).get('/css/app.css');
  assert.equal(html.status, 200);
  assert.equal(css.status, 200);
  assert.match(html.text, /aria-controls="settings-submenu"/);
  assert.match(css.text, /\.sidebar\{[^}]*overflow-y:auto/);
  for (const label of [
    'Pengaturan Umum',
    'Invoice',
    'Setting Email',
    'Whatsapp API',
    'Setting API',
    'Payment Gateway',
  ]) {
    assert.ok(html.text.includes(label), `settings menu should include ${label}`);
  }
  assert.match(script.text, /function renderSettings/);
  assert.match(script.text, /Pratinjau header invoice/);
  assert.match(script.text, /name="logo\$\{side\[0\]\.toUpperCase\(\)\}/);
  assert.match(script.text, /form\.elements\.logoLeft\.files\[0\]/);
  assert.match(script.text, /form\.elements\.logoRight\.files\[0\]/);
  assert.match(script.text, /Logo invoice berhasil disimpan/);
  assert.match(script.text, /Form, penyimpanan, dan penerapan pengaturan ini belum tersedia/);
});

test('router management endpoints require an authenticated admin session', async () => {
  const response = await request(createApp()).get('/api/routers');
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });
});

test('landing page assets are served from the same origin', async () => {
  const app = createApp();
  const css = await request(app).get('/css/landing.css');
  const pagesCss = await request(app).get('/css/pages.css');
  const script = await request(app).get('/js/landing.js');
  assert.equal(css.status, 200);
  assert.equal(pagesCss.status, 200);
  assert.equal(script.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  assert.match(pagesCss.headers['content-type'], /text\/css/);
  assert.match(pagesCss.text, /\.footer-main/);
  assert.match(pagesCss.text, /\.footer-bottom/);
  assert.match(script.headers['content-type'], /javascript/);
  assert.match(script.text, /\/api\/public\/plans/);
  assert.match(script.text, /\/api\/public\/payment-link/);
  assert.match(script.text, /\/api\/public\/coverage-check/);
  assert.match(script.text, /id="cek-jangkauan"/);
  assert.match(script.text, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(script.text, /\{s\}\.tile\.openstreetmap\.org/);
  assert.match(script.text, /pasang-wifi-sumedang-murah/);
});

test('ISP logo image is served from the provided assets folder', async () => {
  const response = await request(createApp()).get('/assets/logo/Logo%20Instalink.png');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /image\/png/);
  assert.ok(response.body.length > 0);
});

test('dashboard JavaScript is served as a same-origin static asset', async () => {
  const app = createApp();
  const [response, routers, services, actions] = await Promise.all([
    request(app).get('/js/app.js'),
    request(app).get('/js/routers.js'),
    request(app).get('/js/services.js'),
    request(app).get('/js/actions.js'),
  ]);
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /javascript/);
  assert.match(response.text, /InstaLinkAdmin/);
  assert.match(routers.text, /function renderRouters/);
  assert.match(routers.text, /data-test-router/);
  assert.match(actions.text, /features\.actions/);
  assert.match(services.text, /name="routerId"/);
});

test('staff cannot manage MikroTik router configurations', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const app = createApp();
  const list = await request(app)
    .get('/api/routers')
    .set('Authorization', `Bearer ${token}`);
  const create = await request(app)
    .post('/api/routers')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(list.status, 403);
  assert.equal(create.status, 403);
});

test('brand favicon is served from the assets directory', async () => {
  const response = await request(createApp()).get('/assets/icons/favicon.svg');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /image\/svg\+xml/);
  assert.match(response.body.toString('utf8'), /<svg/);
});

test('dashboard includes customer, plan, and service edit actions', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-edit-customer/);
  assert.match(response.text, /data-edit-plan/);
  assert.match(response.text, /data-edit-service/);
  assert.match(response.text, /update-customer/);
  assert.match(response.text, /update-plan/);
  assert.match(response.text, /update-service/);
});

test('dashboard supports negotiated OHO and Dedicated service terms', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-plan-type-select/);
  assert.match(response.text, /value="oho"/);
  assert.match(response.text, /value="dedicated"/);
  assert.match(response.text, /data-service-plan-select/);
  assert.match(response.text, /data-service-agreement/);
  assert.match(response.text, /monthlyPrice/);
  assert.match(response.text, /data-contention-ratio/);
  assert.match(response.text, /Rasio/);
});

test('dashboard includes safe deactivation actions for customers, plans, and services', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-delete-customer/);
  assert.match(response.text, /data-delete-service/);
  assert.match(response.text, /Ya, nonaktifkan/);
});

test('dashboard supports reactivating cancelled customers without restarting old services', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-reactivate-customer/);
  assert.match(response.text, /customers\/\$\{encodeURIComponent\(customer\.id\)\}\/activation/);
  assert.match(response.text, /Layanan lama tetap dibatalkan/);
});

test('dashboard provides plan activation and deactivation actions', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-toggle-plan-activation/);
  assert.match(response.text, /Aktifkan/);
  assert.match(response.text, /Nonaktifkan/);
  assert.match(response.text, /\/activation/);
});

test('dashboard provides permanent plan deletion with typed confirmation', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-permanent-plan/);
  assert.match(response.text, /showPermanentConfirmation/);
  assert.match(response.text, /plans\/\$\{encodeURIComponent\(plan\.id\)\}\/permanent/);
});

test('dashboard provides permanent service deletion with typed confirmation', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-permanent-service/);
  assert.match(response.text, /services\/\$\{encodeURIComponent\(service\.id\)\}\/permanent/);
});

test('dashboard provides typed confirmation for permanent customer and invoice deletion', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /data-permanent-customer/);
  assert.match(response.text, /data-permanent-invoice/);
  assert.match(response.text, /showPermanentConfirmation/);
  assert.match(response.text, /Ketik <code>/);
});

test('protected API routes reject requests without a token', async () => {
  const response = await request(createApp()).get('/api/customers');
  assert.equal(response.status, 401);
});

test('overview API requires authentication', async () => {
  const response = await request(createApp()).get('/api/overview');
  assert.equal(response.status, 401);
});

test('dashboard renders detailed overview charts and operational sections', async () => {
  const response = await getAdminScripts(createApp());
  assert.equal(response.status, 200);
  assert.match(response.text, /api\('\/overview'\)/);
  assert.match(response.text, /Tren billing & pembayaran/);
  assert.match(response.text, /Pelanggan per paket/);
  assert.match(response.text, /Tiket perlu perhatian/);
  assert.match(response.text, /data-refresh-dashboard/);
});

test('staff cannot create admin-only plans', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const response = await request(createApp())
    .post('/api/plans')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(response.status, 403);
});

test('staff cannot manage staff accounts', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const response = await request(createApp())
    .get('/api/users')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 403);
});

test('staff cannot edit plans or customer service assignments', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const app = createApp();
  const planResponse = await request(app)
    .patch('/api/plans/00000000-0000-4000-8000-000000000001')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Plan', downloadMbps: 20, uploadMbps: 20, monthlyPrice: 150000 });
  const serviceResponse = await request(app)
    .patch('/api/services/00000000-0000-4000-8000-000000000001')
    .set('Authorization', `Bearer ${token}`)
    .send({ planId: '00000000-0000-4000-8000-000000000002', pppoeUsername: 'test-user' });
  assert.equal(planResponse.status, 403);
  assert.equal(serviceResponse.status, 403);
});

test('staff cannot activate or deactivate plans', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const response = await request(createApp())
    .patch('/api/plans/00000000-0000-4000-8000-000000000001/activation')
    .set('Authorization', `Bearer ${token}`)
    .send({ isActive: true });
  assert.equal(response.status, 403);
});

test('staff cannot permanently delete plans', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const response = await request(createApp())
    .delete('/api/plans/00000000-0000-4000-8000-000000000001/permanent')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 403);
});

test('staff cannot permanently delete services', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const response = await request(createApp())
    .delete('/api/services/00000000-0000-4000-8000-000000000001/permanent')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 403);
});

test('staff cannot reactivate customers', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const response = await request(createApp())
    .patch('/api/customers/00000000-0000-4000-8000-000000000001/activation')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 403);
});

test('staff cannot deactivate customers, plans, or services', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const app = createApp();
  const paths = [
    '/api/customers/00000000-0000-4000-8000-000000000001',
    '/api/plans/00000000-0000-4000-8000-000000000001',
    '/api/services/00000000-0000-4000-8000-000000000001',
  ];
  const responses = await Promise.all(paths.map((path) => request(app)
    .delete(path)
    .set('Authorization', `Bearer ${token}`)));
  assert.deepEqual(responses.map((response) => response.status), [403, 403, 403]);
});

test('staff cannot permanently delete customers or invoices', async () => {
  const token = jwt.sign({ sub: 'staff-id', role: 'staff' }, process.env.JWT_SECRET);
  const app = createApp();
  const responses = await Promise.all([
    request(app)
      .delete('/api/customers/00000000-0000-4000-8000-000000000001/permanent')
      .set('Authorization', `Bearer ${token}`),
    request(app)
      .delete('/api/invoices/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${token}`),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [403, 403]);
});

test('unknown routes return a JSON 404', async () => {
  const response = await request(createApp()).get('/missing');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Not found' });
});
