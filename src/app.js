require('dotenv').config();
const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { requireAuth } = require('./middleware/auth');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https://tile.openstreetmap.org'],
      },
    },
  }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : false,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    await db.query('SELECT 1');
    return res.json({ status: 'ready' });
  });

  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), require('./routes/auth'));
  app.use('/api/webhooks', require('./routes/webhooks'));
  app.use('/api/public', require('./routes/public'));

  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });
  app.use('/vendor/leaflet', express.static(
    path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist'),
  ));
  app.get([
    '/pasang-wifi-sumedang',
    '/pasang-wifi-sumedang-murah',
    '/lapor-gangguan',
    '/galeri',
    '/berita',
    '/bayar',
    '/kontak',
    '/corporate',
  ], (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
  app.get('/api/public/plans', async (_req, res) => {
    const result = await db.query(
      `SELECT id, name, download_mbps, upload_mbps, monthly_price
       FROM plans
       WHERE is_active = TRUE AND plan_type = 'standard'
       ORDER BY monthly_price, name`,
    );
    return res.json({ data: result.rows });
  });

  app.use('/api', requireAuth);
  app.use('/api/overview', require('./routes/overview'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/plans', require('./routes/plans'));
  app.use('/api/routers', require('./routes/routers'));
  app.use('/api/services', require('./routes/services'));
  app.use('/api/invoices', require('./routes/invoices'));
  app.use('/api/tickets', require('./routes/tickets'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/requests', require('./routes/requests'));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Upload file is too large' });
    if (error.code === '23505') return res.status(409).json({ error: 'A record with the same unique value already exists' });
    if (error.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
    console.error('Request failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
