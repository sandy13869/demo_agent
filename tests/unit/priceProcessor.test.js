'use strict';

jest.mock('../../models/PriceRecord', () => ({
  PriceRecord: jest.fn(),
  getLatestRecord: jest.fn(),
}));

jest.mock('../../services/priceSourceClient', () => ({
  fetchPrices: jest.fn(),
  SYMBOLS: ['BTC', 'ETH'],
}));

const { runCycle } = require('../../services/priceProcessor');
const { PriceRecord, getLatestRecord } = require('../../models/PriceRecord');
const { fetchPrices } = require('../../services/priceSourceClient');

describe('priceProcessor.runCycle', () => {
  let mockSave;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSave = jest.fn().mockResolvedValue({});
    PriceRecord.mockImplementation(() => ({ save: mockSave }));
  });

  it('inserts baseline records when no previous record exists', async () => {
    fetchPrices.mockResolvedValue({ BTC: 50000, ETH: 3000 });
    getLatestRecord.mockResolvedValue(null);

    await runCycle();

    // One save per symbol (BTC + ETH)
    expect(mockSave).toHaveBeenCalledTimes(2);
    // Baseline has null delta and percentageChange
    const [[btcDoc], [ethDoc]] = PriceRecord.mock.calls;
    expect(btcDoc.deltaUsd).toBeNull();
    expect(btcDoc.percentageChange).toBeNull();
    expect(ethDoc.deltaUsd).toBeNull();
  });

  it('inserts records with correct delta and percentageChange on price increase', async () => {
    fetchPrices.mockResolvedValue({ BTC: 51000, ETH: 3100 });
    getLatestRecord
      .mockResolvedValueOnce({ priceUsd: 50000 }) // BTC previous
      .mockResolvedValueOnce({ priceUsd: 3000 });  // ETH previous

    await runCycle();

    expect(mockSave).toHaveBeenCalledTimes(2);
    const [[btcDoc]] = PriceRecord.mock.calls;
    expect(btcDoc.priceUsd).toBe(51000);
    expect(btcDoc.previousPriceUsd).toBe(50000);
    expect(btcDoc.deltaUsd).toBeCloseTo(1000, 2);
    expect(btcDoc.percentageChange).toBeCloseTo(2.0, 2);
  });

  it('skips insert when price does not increase', async () => {
    fetchPrices.mockResolvedValue({ BTC: 49000, ETH: 2900 });
    getLatestRecord.mockResolvedValue({ priceUsd: 50000 });

    await runCycle();

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('skips insert when price is equal to previous', async () => {
    fetchPrices.mockResolvedValue({ BTC: 50000, ETH: 3000 });
    getLatestRecord.mockResolvedValue({ priceUsd: 50000 });

    await runCycle();

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('handles API fetch failure gracefully without throwing', async () => {
    fetchPrices.mockResolvedValue(null);

    await expect(runCycle()).resolves.not.toThrow();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('continues processing remaining symbols after a duplicate key error', async () => {
    fetchPrices.mockResolvedValue({ BTC: 51000, ETH: 3100 });
    getLatestRecord
      .mockResolvedValueOnce({ priceUsd: 50000 }) // BTC previous
      .mockResolvedValueOnce({ priceUsd: 3000 });  // ETH previous

    const dupError = Object.assign(new Error('duplicate key'), { code: 11000 });
    mockSave
      .mockRejectedValueOnce(dupError) // BTC fails with duplicate
      .mockResolvedValueOnce({});       // ETH succeeds

    await expect(runCycle()).resolves.not.toThrow();
    expect(mockSave).toHaveBeenCalledTimes(2);
  });
});
