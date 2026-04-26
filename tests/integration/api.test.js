'use strict';

// Mock DB and model before loading app
jest.mock('../../config/database', () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
}));

jest.mock('../../models/PriceRecord', () => ({
  PriceRecord: {
    find: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
  },
  getLatestRecord: jest.fn(),
}));

const request = require('supertest');
const app = require('../../app');
const { PriceRecord, getLatestRecord } = require('../../models/PriceRecord');

const SAMPLE_RECORD = {
  _id: '6629a1f2c3b4d5e6f7a8b9c0',
  symbol: 'BTC',
  priceUsd: 78882,
  previousPriceUsd: 78878,
  deltaUsd: 4,
  percentageChange: 0.0051,
  source: 'coingecko',
  timestamp: '2026-04-23T00:35:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body.database).toBe('connected');
  });
});

describe('GET /api/prices/latest', () => {
  it('returns latest records for BTC and ETH', async () => {
    getLatestRecord
      .mockResolvedValueOnce(SAMPLE_RECORD)
      .mockResolvedValueOnce({ ...SAMPLE_RECORD, symbol: 'ETH', priceUsd: 3200 });

    const res = await request(app).get('/api/prices/latest');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('BTC');
    expect(res.body).toHaveProperty('ETH');
    expect(res.body.BTC.priceUsd).toBe(78882);
  });
});

describe('GET /api/prices/latest/:symbol', () => {
  it('returns 200 for a valid symbol', async () => {
    getLatestRecord.mockResolvedValue(SAMPLE_RECORD);
    const res = await request(app).get('/api/prices/latest/BTC');
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe('BTC');
  });

  it('is case-insensitive', async () => {
    getLatestRecord.mockResolvedValue(SAMPLE_RECORD);
    const res = await request(app).get('/api/prices/latest/btc');
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid symbol', async () => {
    const res = await request(app).get('/api/prices/latest/DOGE');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when no records exist', async () => {
    getLatestRecord.mockResolvedValue(null);
    const res = await request(app).get('/api/prices/latest/ETH');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/prices/history/:symbol', () => {
  it('returns paginated history', async () => {
    PriceRecord.countDocuments.mockResolvedValue(48);
    PriceRecord.find.mockReturnValue({
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: () => Promise.resolve([SAMPLE_RECORD]),
          }),
        }),
      }),
    });

    const res = await request(app).get('/api/prices/history/BTC?limit=12&page=2');
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe('BTC');
    expect(res.body.total).toBe(48);
    expect(res.body.page).toBe(2);
    expect(res.body.pages).toBe(4);
    expect(res.body.records).toHaveLength(1);
  });

  it('returns 400 for an invalid symbol', async () => {
    const res = await request(app).get('/api/prices/history/XRP');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid limit', async () => {
    const res = await request(app).get('/api/prices/history/BTC?limit=0');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/prices/stats', () => {
  it('returns aggregated stats for all symbols', async () => {
    PriceRecord.aggregate.mockResolvedValue([
      { _id: 'BTC', count: 24, minPriceUsd: 78000, maxPriceUsd: 82000, avgPriceUsd: 80000, totalDeltaUsd: 4000, avgPercentageChange: 0.03 },
      { _id: 'ETH', count: 18, minPriceUsd: 3000, maxPriceUsd: 3500, avgPriceUsd: 3200, totalDeltaUsd: 200, avgPercentageChange: 0.02 },
    ]);

    const res = await request(app).get('/api/prices/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('BTC');
    expect(res.body).toHaveProperty('ETH');
    expect(res.body.BTC.totalDeltaUsd).toBe(4000);
    expect(res.body.BTC.avgPercentageChange).toBe(0.03);
  });

  it('returns 400 for an invalid window value', async () => {
    const res = await request(app).get('/api/prices/stats?window=5h');
    expect(res.status).toBe(400);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
