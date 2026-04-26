'use strict';

const { Router } = require('express');
const { PriceRecord, getLatestRecord } = require('../models/PriceRecord');

const router = Router();

const VALID_SYMBOLS = ['BTC', 'ETH'];

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
 *         percentageChange:
 *           type: number
 *           nullable: true
 *           description: Percentage price increase relative to the previous stored price
 *           example: 0.0051
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
  if (!VALID_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: `Invalid symbol. Use ${VALID_SYMBOLS.join(' or ')}.` });
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
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for offset-based pagination
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
 *         description: Paginated list of price records
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
 *                 total:
 *                   type: integer
 *                   description: Total matching records (for pagination)
 *                   example: 48
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 pages:
 *                   type: integer
 *                   example: 4
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
  if (!VALID_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: `Invalid symbol. Use ${VALID_SYMBOLS.join(' or ')}.` });
  }

  const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);
  if (isNaN(limit) || limit < 1) {
    return res.status(400).json({ error: 'limit must be a positive integer (max 500).' });
  }

  const page = parseInt(req.query.page || '1', 10);
  if (isNaN(page) || page < 1) {
    return res.status(400).json({ error: 'page must be a positive integer.' });
  }

  const filter = { symbol };
  if (req.query.from || req.query.to) {
    filter.timestamp = {};
    if (req.query.from) filter.timestamp.$gte = new Date(req.query.from);
    if (req.query.to)   filter.timestamp.$lte = new Date(req.query.to);
    const fromValid = !req.query.from || !isNaN(filter.timestamp.$gte);
    const toValid   = !req.query.to   || !isNaN(filter.timestamp.$lte);
    if (!fromValid || !toValid) {
      return res.status(400).json({ error: 'from/to must be valid ISO-8601 timestamps.' });
    }
  }

  try {
    const [total, records] = await Promise.all([
      PriceRecord.countDocuments(filter),
      PriceRecord.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      symbol,
      count: records.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      records,
    });
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
 *       Returns total stored records, min/max/avg price, total accumulated delta,
 *       and average percentage change per symbol.
 *       Use the optional `window` parameter to scope stats to a recent time window.
 *     tags:
 *       - Prices
 *     parameters:
 *       - in: query
 *         name: window
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d, 30d]
 *         description: Restrict stats to records within this time window
 *         example: 24h
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
 *                   totalDeltaUsd:
 *                     type: number
 *                     description: Sum of all upward price movements
 *                     example: 4120.5
 *                   avgPercentageChange:
 *                     type: number
 *                     nullable: true
 *                     description: Average percentage increase per stored record
 *                     example: 0.0312
 *       400:
 *         description: Invalid window value
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
router.get('/stats', async (req, res) => {
  const WINDOW_MAP = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };

  const matchStage = {};
  if (req.query.window) {
    if (!WINDOW_MAP[req.query.window]) {
      return res.status(400).json({ error: 'window must be one of: 1h, 24h, 7d, 30d.' });
    }
    const hoursAgo = WINDOW_MAP[req.query.window];
    matchStage.timestamp = { $gte: new Date(Date.now() - hoursAgo * 60 * 60 * 1000) };
  }

  try {
    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: '$symbol',
          count: { $sum: 1 },
          minPriceUsd: { $min: '$priceUsd' },
          maxPriceUsd: { $max: '$priceUsd' },
          avgPriceUsd: { $avg: '$priceUsd' },
          totalDeltaUsd: { $sum: { $ifNull: ['$deltaUsd', 0] } },
          avgPercentageChange: { $avg: '$percentageChange' },
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
        totalDeltaUsd: parseFloat(row.totalDeltaUsd.toFixed(2)),
        avgPercentageChange: row.avgPercentageChange !== null
          ? parseFloat(row.avgPercentageChange.toFixed(4))
          : null,
      };
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
