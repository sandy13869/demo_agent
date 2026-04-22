'use strict';

const cron = require('node-cron');
const logger = require('../logger');
const { runCycle } = require('./priceProcessor');

let isRunning = false;
let cronTask = null;

/**
 * Execute a single cycle with an overlap guard.
 * If the previous cycle has not finished yet, this invocation is skipped.
 */
async function safeCycle() {
  if (isRunning) {
    logger.warn('[scheduler] Previous cycle still running — skipping this tick.');
    return;
  }
  isRunning = true;
  try {
    await runCycle();
  } catch (err) {
    logger.error(`[scheduler] Unhandled error in cycle: ${err.message}`, err);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler.
 * Runs one immediate cycle, then repeats at every 5-minute wall-clock boundary
 * (e.g. :00, :05, :10, ... :55).
 */
async function start() {
  logger.info('[scheduler] Running initial cycle on startup...');
  await safeCycle();

  // Cron: "every 5 minutes" => 0,5,10,...,55 of every hour
  cronTask = cron.schedule('*/5 * * * *', () => {
    safeCycle();
  });

  logger.info('[scheduler] Scheduler started — polling every 5 minutes.');
}

/**
 * Gracefully stop the scheduler.
 */
function stop() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[scheduler] Scheduler stopped.');
  }
}

module.exports = { start, stop };
