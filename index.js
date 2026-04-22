'use strict';

// Must be first — loads and validates environment variables before anything else
const env = require('./config/environment');

const http = require('http');
const logger = require('./logger');
const db = require('./config/database');
const scheduler = require('./services/scheduler');
const app = require('./app');

async function main() {
  logger.info('[main] Starting crypto price monitor agent...');

  try {
    await db.connect();
  } catch (err) {
    logger.error(`[main] Failed to connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  // ── HTTP server (Express + Swagger UI) ───────────────────────────────────
  const server = http.createServer(app);
  server.listen(env.PORT, () => {
    logger.info(`[main] HTTP server listening on http://localhost:${env.PORT}`);
    logger.info(`[main] Swagger UI → http://localhost:${env.PORT}/api-docs`);
  });

  // ── Scheduler ─────────────────────────────────────────────────────────────
  await scheduler.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.info(`[main] Received ${signal} — shutting down gracefully...`);
    scheduler.stop();
    server.close(() => logger.info('[main] HTTP server closed.'));
    try {
      await db.disconnect();
    } catch (err) {
      logger.error(`[main] Error during disconnect: ${err.message}`);
    }
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error(`[main] Uncaught exception: ${err.message}`, err);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`[main] Unhandled promise rejection: ${reason}`);
  });
}

main();
