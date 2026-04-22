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
  MONGODB_URI: process.env.MONGODB_URI,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  COINGECKO_BASE_URL:
    process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
  API_TIMEOUT_MS: parseInt(process.env.API_TIMEOUT_MS || '5000', 10),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
};
