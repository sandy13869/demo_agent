'use strict';

const mongoose = require('mongoose');

const priceRecordSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      enum: ['BTC', 'ETH'],
      uppercase: true,
    },
    priceUsd: {
      type: Number,
      required: true,
      min: 0,
    },
    previousPriceUsd: {
      type: Number,
      default: null,
    },
    deltaUsd: {
      type: Number,
      default: null,
    },
    source: {
      type: String,
      default: 'coingecko',
    },
    timestamp: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  { versionKey: false }
);

// Unique constraint: prevents duplicate insert for same symbol+timestamp
priceRecordSchema.index({ symbol: 1, timestamp: 1 }, { unique: true });

// Efficient "latest price per symbol" lookup
priceRecordSchema.index({ symbol: 1, timestamp: -1 });

const PriceRecord = mongoose.model('PriceRecord', priceRecordSchema);

/**
 * Returns the most recently stored price record for the given symbol,
 * or null if no record exists.
 * @param {string} symbol - e.g. 'BTC' or 'ETH'
 * @returns {Promise<object|null>}
 */
async function getLatestRecord(symbol) {
  return PriceRecord.findOne({ symbol: symbol.toUpperCase() })
    .sort({ timestamp: -1 })
    .lean();
}

module.exports = { PriceRecord, getLatestRecord };
