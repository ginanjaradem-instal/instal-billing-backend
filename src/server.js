require('dotenv').config();
const { createApp } = require('./app');
const { pool } = require('./db');
const { createRadiusServer } = require('./services/radius');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

const port = Number(process.env.PORT || 3000);
let httpServer;
let radiusServer;
let isShuttingDown = false;

async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (radiusServer) await radiusServer.close();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close((error) => {
      if (error) {
        console.error('HTTP server shutdown failed:', error);
        process.exitCode = 1;
      }
      resolve();
    }));
  }
  await pool.end();
}

async function start() {
  if (process.env.RADIUS_ENABLED === 'true') {
    const authPort = Number(process.env.RADIUS_AUTH_PORT || 1812);
    const accountingPort = Number(process.env.RADIUS_ACCOUNTING_PORT || 1813);
    if (!Number.isInteger(authPort) || authPort < 1 || authPort > 65535
      || !Number.isInteger(accountingPort) || accountingPort < 1
      || accountingPort > 65535 || authPort === accountingPort) {
      throw new Error('RADIUS authentication/accounting ports must be valid, distinct UDP ports');
    }
    if (!/^[a-f\d]{64}$/i.test(process.env.MIKROTIK_ENCRYPTION_KEY || '')) {
      throw new Error('MIKROTIK_ENCRYPTION_KEY must be configured before enabling RADIUS');
    }
    radiusServer = createRadiusServer({
      authPort,
      accountingPort,
      address: process.env.RADIUS_BIND_ADDRESS || '0.0.0.0',
    });
    await radiusServer.start();
    console.log(`RADIUS listening on UDP ${authPort} (authentication) and ${accountingPort} (accounting)`);
  }

  httpServer = createApp().listen(port, () => {
    console.log(`ISP billing API listening on port ${port}`);
  });
}

process.on('SIGINT', () => shutdown().catch((error) => {
  console.error('Shutdown failed:', error.message);
  process.exitCode = 1;
}));
process.on('SIGTERM', () => shutdown().catch((error) => {
  console.error('Shutdown failed:', error.message);
  process.exitCode = 1;
}));

start().catch((error) => {
  console.error('Server startup failed:', error.message);
  process.exitCode = 1;
  shutdown().catch((shutdownError) => {
    console.error('Shutdown failed:', shutdownError.message);
  });
});
