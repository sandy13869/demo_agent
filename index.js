'use strict';

// Must be first — loads and validates environment variables before anything else
require('./config/environment');

const logger = require('./logger');
const db = require('./config/database');
const scheduler = require('./services/scheduler');

async function main() {
  logger.info('[main] Starting crypto price monitor agent...');

  try {
    await db.connect();
  } catch (err) {
    logger.error(`[main] Failed to connect to MongoDB: ${err.message}`);
    process.exit(1);
  }

  await scheduler.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    logger.info(`[main] Received ${signal} — shutting down gracefully...`);
    scheduler.stop();
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
