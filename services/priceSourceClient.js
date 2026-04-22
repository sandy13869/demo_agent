'use strict';

const axios = require('axios');
const logger = require('../logger');
const { COINGECKO_BASE_URL, API_TIMEOUT_MS, MAX_RETRIES } = require('../config/environment');

// CoinGecko coin IDs for the symbols we track
const SYMBOL_TO_ID = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
};

const SYMBOLS = Object.keys(SYMBOL_TO_ID);

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a single attempt from CoinGecko simple/price endpoint.
 * Returns a map of { BTC: 45231.5, ETH: 3200.1 } or throws.
 */
async function fetchOnce() {
  const ids = Object.values(SYMBOL_TO_ID).join(',');
  const url = `${COINGECKO_BASE_URL}/simple/price`;

  const response = await axios.get(url, {
    params: { ids, vs_currencies: 'usd' },
    timeout: API_TIMEOUT_MS,
  });

  const data = response.data;
  const result = {};

  for (const [symbol, coinId] of Object.entries(SYMBOL_TO_ID)) {
    const entry = data[coinId];
    if (!entry || typeof entry.usd !== 'number') {
      throw new Error(
        `Unexpected response for ${symbol} (id=${coinId}): ${JSON.stringify(entry)}`
      );
    }
    result[symbol] = entry.usd;
  }

  return result; // e.g. { BTC: 45231.5, ETH: 3200.1 }
}

/**
 * Fetch BTC and ETH USD prices with retry/exponential backoff.
 * Returns { BTC: <number>, ETH: <number> } or null on total failure.
 */
async function fetchPrices() {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const prices = await fetchOnce();
      logger.info(
        `[priceSourceClient] Fetched prices — BTC: $${prices.BTC}, ETH: $${prices.ETH}`
      );
      return prices;
    } catch (err) {
      lastError = err;
      const backoffMs = 100 * Math.pow(2, attempt - 1); // 100ms, 200ms, 400ms
      logger.warn(
        `[priceSourceClient] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}. Retrying in ${backoffMs}ms...`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs);
      }
    }
  }

  logger.error(
    `[priceSourceClient] All ${MAX_RETRIES} fetch attempts failed. Last error: ${lastError.message}`
  );
  return null;
}

module.exports = { fetchPrices, SYMBOLS };
