'use strict';

const { Router } = require('express');
const { PriceRecord, getLatestRecord } = require('../models/PriceRecord');

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PriceRecord:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "6629a1f2c3b4d5e6f7a8b9c0"
 *         symbol:
 *           type: string
 *           enum: [BTC, ETH]
 *           example: BTC
 *         priceUsd:
 *           type: number
 *           example: 78882
 *         previousPriceUsd:
 *           type: number
 *           nullable: true
 *           example: 78878
 *         deltaUsd:
 *           type: number
 *           nullable: true
 *           example: 4
 *         source:
 *           type: string
 *           example: coingecko
 *         timestamp:
 *           type: string
 *           format: date-time
 *           example: "2026-04-23T00:35:00.000Z"
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Invalid symbol. Use BTC or ETH."
 */

/**
 * @swagger
 * /api/prices/latest:
 *   get:
 *     summary: Get latest stored price for all symbols
 *     description: Returns the most recently stored price record for both BTC and ETH.
 *     tags:
 *       - Prices
 *     responses:
 *       200:
 *         description: Latest price records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 BTC:
 *                   $ref: '#/components/schemas/PriceRecord'
 *                 ETH:
 *                   $ref: '#/components/schemas/PriceRecord'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/latest', async (req, res) => {
  try {
    const [btc, eth] = await Promise.all([
      getLatestRecord('BTC'),
      getLatestRecord('ETH'),
    ]);
    res.json({ BTC: btc, ETH: eth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/prices/latest/{symbol}:
 *   get:
 *     summary: Get latest stored price for a specific symbol
 *     tags:
 *       - Prices
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *           enum: [BTC, ETH]
 *         description: Crypto symbol (case-insensitive)
 *         example: BTC
 *     responses:
 *       200:
 *         description: Latest price record for the symbol
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PriceRecord'
 *       400:
 *         description: Invalid symbol
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No records found for this symbol
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/latest/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!['BTC', 'ETH'].includes(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol. Use BTC or ETH.' });
  }
  try {
    const record = await getLatestRecord(symbol);
    if (!record) {
      return res.status(404).json({ error: `No records found for ${symbol}.` });
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/prices/history/{symbol}:
 *   get:
 *     summary: Get price increase history for a symbol
 *     description: >
 *       Returns stored price records for the given symbol in descending order
 *       (newest first). Only records where price increased are stored.
 *       Supports optional pagination and date-range filtering.
 *     tags:
 *       - Prices
 *     parameters:
 *       - in: path
 *         name: symbol
 *         required: true
 *         schema:
 *           type: string
 *           enum: [BTC, ETH]
 *         example: BTC
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 50
 *         description: Maximum number of records to return
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter records at or after this ISO-8601 timestamp
 *         example: "2026-04-23T00:00:00.000Z"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter records at or before this ISO-8601 timestamp
 *         example: "2026-04-23T23:59:59.999Z"
 *     responses:
 *       200:
 *         description: List of price records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 symbol:
 *                   type: string
 *                   example: BTC
 *                 count:
 *                   type: integer
 *                   example: 12
 *                 records:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PriceRecord'
 *       400:
 *         description: Invalid symbol or query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!['BTC', 'ETH'].includes(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol. Use BTC or ETH.' });
  }

  const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
  if (isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'limit must be a positive integer (max 500).' });
  }

  const filter = { symbol };
  if (req.query.from || req.query.to) {
    filter.timestamp = {};
    if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
    if (req.query.to)   filter.timestamp.$lte = new Date(req.query.to);
    if (isNaN(filter.timestamp.$gte) || isNaN(filter.timestamp.$lte)) {
      return res.status(400).json({ error: 'from/to must be valid ISO-8601 timestamps.' });
    }
  }

  try {
    const records = await PriceRecord.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json({ symbol, count: records.length, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/prices/stats:
 *   get:
 *     summary: Get aggregate price statistics for all symbols
 *     description: >
 *       Returns total stored records, min price, max price, and average price
 *       per symbol, computed across all stored price-increase records.
 *     tags:
 *       - Prices
 *     responses:
 *       200:
 *         description: Aggregated stats per symbol
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   count:
 *                     type: integer
 *                     example: 24
 *                   minPriceUsd:
 *                     type: number
 *                     example: 78200
 *                   maxPriceUsd:
 *                     type: number
 *                     example: 82500
 *                   avgPriceUsd:
 *                     type: number
 *                     example: 80345.75
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/stats', async (req, res) => {
  try {
    const pipeline = [
      {
        $group: {
          _id: '$symbol',
          count: { $sum: 1 },
          minPriceUsd: { $min: '$priceUsd' },
          maxPriceUsd: { $max: '$priceUsd' },
          avgPriceUsd: { $avg: '$priceUsd' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const rows = await PriceRecord.aggregate(pipeline);
    const result = {};
    for (const row of rows) {
      result[row._id] = {
        count: row.count,
        minPriceUsd: row.minPriceUsd,
        maxPriceUsd: row.maxPriceUsd,
        avgPriceUsd: parseFloat(row.avgPriceUsd.toFixed(2)),
      };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
