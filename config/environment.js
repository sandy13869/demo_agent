'use strict';

require('dotenv').config();

const REQUIRED = ['MONGODB_URI'];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[environment] Missing required environment variable: ${key}`);
    console.error('[environment] Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

module.exports = {
  NODE_ENV:           process.env.NODE_ENV || 'development',
  MONGODB_URI:        process.env.MONGODB_URI,
  PORT:               parseInt(process.env.PORT || '3000', 10),
  LOG_LEVEL:          process.env.LOG_LEVEL || 'info',
  CORS_ORIGIN:        process.env.CORS_ORIGIN || '*',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  RATE_LIMIT_MAX:     parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  COINGECKO_BASE_URL: process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
  API_TIMEOUT_MS:     parseInt(process.env.API_TIMEOUT_MS || '5000', 10),
  MAX_RETRIES:        parseInt(process.env.MAX_RETRIES || '3', 10),
};
