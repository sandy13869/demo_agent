'use strict';

const logger = require('../logger');
const { fetchPrices, SYMBOLS } = require('./priceSourceClient');
const { PriceRecord, getLatestRecord } = require('../models/PriceRecord');

/**
 * Run one price-check cycle:
 *  1. Fetch current BTC + ETH prices from CoinGecko.
 *  2. For each symbol, compare against the latest stored price.
 *  3. Insert a new record only when current price > previous stored price,
 *     OR when there is no previous record (first-ever reading, used as baseline).
 */
async function runCycle() {
  logger.info('[priceProcessor] Starting price check cycle...');

  const prices = await fetchPrices();

  if (!prices) {
    logger.warn('[priceProcessor] No prices returned — skipping this cycle.');
    return;
  }

  for (const symbol of SYMBOLS) {
    const currentPrice = prices[symbol];
    const latest = await getLatestRecord(symbol);

    if (!latest) {
      await insertRecord(symbol, currentPrice, null, null, null, 'baseline');
      continue;
    }

    const previousPrice = latest.priceUsd;

    if (currentPrice > previousPrice) {
      const delta = parseFloat((currentPrice - previousPrice).toFixed(8));
      const pctChange = parseFloat(
        ((currentPrice - previousPrice) / previousPrice * 100).toFixed(4)
      );
      await insertRecord(symbol, currentPrice, previousPrice, delta, pctChange, 'price_increase');
    } else {
      logger.info(
        `[priceProcessor] ${symbol}: $${currentPrice} <= last stored $${previousPrice} — skip insert`
      );
    }
  }

  logger.info('[priceProcessor] Cycle complete.');
}

/**
 * Insert a PriceRecord document.
 * Duplicate key errors (same symbol+timestamp) are silently discarded.
 */
async function insertRecord(symbol, priceUsd, previousPriceUsd, deltaUsd, percentageChange, reason) {
  try {
    const doc = new PriceRecord({
      symbol,
      priceUsd,
      previousPriceUsd,
      deltaUsd,
      percentageChange,
      source: 'coingecko',
      timestamp: new Date(),
    });
    await doc.save();
    logger.info(
      `[priceProcessor] ${symbol} stored — $${priceUsd} (reason: ${reason})` +
        (deltaUsd !== null ? ` delta: +$${deltaUsd} (+${percentageChange}%)` : '')
    );
  } catch (err) {
    if (err.code === 11000) {
      logger.warn(`[priceProcessor] ${symbol}: duplicate record at same timestamp, skipped.`);
    } else {
      logger.error(`[priceProcessor] Failed to insert ${symbol} record: ${err.message}`);
    }
  }
}

module.exports = { runCycle };
