# Crypto Price Monitor Agent

A local Node.js agent that polls **BTC and ETH prices in USD** from the CoinGecko API every **5 minutes** and stores a record in a **MongoDB collection** only when the current price is **higher than the last stored price** for that symbol.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Packages & Dependencies](#packages--dependencies)
- [Data Model](#data-model)
- [How the Price Rule Works](#how-the-price-rule-works)
- [Setup & Run](#setup--run)
- [Environment Variables](#environment-variables)
- [Verified Live Output](#verified-live-output)
- [MongoDB Queries](#mongodb-queries)
- [Design Decisions](#design-decisions)

---

## Overview

| Property       | Value                                              |
|----------------|----------------------------------------------------|
| Runtime        | Node.js (CommonJS)                                 |
| Price Source   | CoinGecko public REST API (no API key required)    |
| Database       | MongoDB (local or Atlas)                           |
| ODM            | Mongoose                                           |
| Symbols        | BTC, ETH (USD-quoted)                              |
| Poll Interval  | Every 5 minutes on wall-clock boundaries           |
| Insert Rule    | Only when `currentPrice > lastStoredPrice`         |
| First Run      | Inserts baseline records unconditionally           |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          index.js (entry)                         │
│  1. Load & validate environment variables (fail-fast on missing)  │
│  2. Connect to MongoDB (exit on connection failure)               │
│  3. Start scheduler                                               │
│  4. Register SIGINT / SIGTERM for graceful shutdown               │
└──────────────────────┬───────────────────────────────────────────┘
                       │ starts
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    services/scheduler.js                          │
│  • Runs one immediate cycle on startup                            │
│  • Schedules repeating cron: */5 * * * *                         │
│  • Overlap guard — skips a tick if previous cycle still running   │
└──────────────────────┬───────────────────────────────────────────┘
                       │ calls
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   services/priceProcessor.js                      │
│  For each symbol (BTC, ETH):                                      │
│    1. Fetch current price from CoinGecko                          │
│    2. Query MongoDB for latest stored record                      │
│    3a. No previous record → insert as baseline                    │
│    3b. currentPrice > previousPrice → insert with delta           │
│    3c. currentPrice ≤ previousPrice → log & skip                  │
└────────┬──────────────────────────────┬──────────────────────────┘
         │ fetches                      │ reads/writes
         ▼                              ▼
┌─────────────────────┐    ┌────────────────────────────────────────┐
│ services/           │    │ models/PriceRecord.js (Mongoose)        │
│ priceSourceClient.js│    │                                         │
│                     │    │  Fields: symbol, priceUsd,              │
│ • GET /simple/price │    │  previousPriceUsd, deltaUsd,            │
│   (CoinGecko API)   │    │  timestamp, source                      │
│ • Retry x3 with     │    │                                         │
│   exponential       │    │  Indexes:                               │
│   backoff           │    │  • Unique (symbol, timestamp)           │
│ • Returns null on   │    │  • (symbol, timestamp -1) for queries   │
│   total failure     │    │                                         │
└─────────────────────┘    └────────────────────────────────────────┘
```

### Startup Flow

```
npm start
    │
    ├─► config/environment.js   — parse .env; exit(1) if MONGODB_URI missing
    ├─► config/database.js      — mongoose.connect(); exit(1) on timeout
    ├─► services/scheduler.js   — run immediate cycle, then cron every 5 min
    │       └─► services/priceProcessor.js
    │               ├─► services/priceSourceClient.js  (CoinGecko HTTP)
    │               └─► models/PriceRecord.js           (MongoDB read/write)
    └─► process signals         — SIGINT/SIGTERM → stop cron → disconnect DB
```

---

## Project Structure

```
support/
├── index.js                     Entry point: env → DB → scheduler → shutdown
├── logger.js                    Winston logger (console, colourised, timestamped)
├── .env                         Your local environment variables (git-ignored)
├── .env.example                 Template — copy to .env and fill in values
├── .gitignore                   Excludes .env, node_modules, *.log
├── package.json
│
├── config/
│   ├── environment.js           Load dotenv, validate required vars, export constants
│   └── database.js              mongoose.connect() / disconnect() lifecycle
│
├── models/
│   └── PriceRecord.js           Mongoose schema, indexes, getLatestRecord() helper
│
└── services/
    ├── priceSourceClient.js     CoinGecko API client with retry/backoff
    ├── priceProcessor.js        Core business logic: compare & conditionally insert
    └── scheduler.js             node-cron scheduler + overlap guard
```

---

## Packages & Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **axios** | ^1.11.0 | HTTP client used to call the CoinGecko REST API. Handles request timeouts cleanly and exposes structured error objects for retry logic. |
| **dotenv** | ^17.4.2 | Loads environment variables from the `.env` file into `process.env` at startup. Keeps secrets and config out of source code. |
| **mongoose** | ^8.17.0 | MongoDB Object Data Mapper (ODM). Provides schema definition, validation, index management, and async query helpers on top of the native MongoDB driver. |
| **node-cron** | ^4.2.1 | Cron-style scheduler. Fires a callback on wall-clock boundaries (`*/5 * * * *` = every :00, :05, :10 … :55 minute of every hour). More precise than `setInterval` for long-running daemons. |
| **winston** | ^3.19.0 | Production-grade structured logger. Outputs colourised, timestamped log lines to the console. Supports multiple log levels (`error`, `warn`, `info`, `debug`) and can be extended with file/rotation transports later. |
| **express** | ^5.1.0 | Installed in the project but not used by the agent itself. Available for adding a `/health` endpoint or an admin API in future iterations. |
| **nodemon** | ^3.1.10 | Development tool. Watches source files and restarts the Node process automatically on changes. Used via `npm run dev`. |

### Indirect / Bundled

| Package | Pulled in by | Role |
|---------|-------------|------|
| **mongodb** (native driver) | mongoose | Low-level MongoDB wire protocol |
| **bson** | mongoose | BSON serialisation for Mongo documents |

---

## Data Model

Collection name: `pricerecords`

```js
{
  symbol:           String,   // "BTC" or "ETH"
  priceUsd:         Number,   // Current USD price — e.g. 79029
  previousPriceUsd: Number,   // Last stored price before this record (null for baseline)
  deltaUsd:         Number,   // priceUsd − previousPriceUsd (null for baseline)
  source:           String,   // Always "coingecko" in this version
  timestamp:        Date,     // Server-generated ISO-8601 UTC timestamp
}
```

### Indexes

| Index | Fields | Options | Purpose |
|-------|--------|---------|---------|
| Unique constraint | `{ symbol: 1, timestamp: 1 }` | `unique: true` | Prevents duplicate documents if the scheduler fires twice in the same second |
| Query optimisation | `{ symbol: 1, timestamp: -1 }` | — | Powers the "latest record per symbol" lookup with O(log n) performance |

### Example Documents

**Baseline record (first run)**
```json
{
  "symbol": "BTC",
  "priceUsd": 79029,
  "previousPriceUsd": null,
  "deltaUsd": null,
  "source": "coingecko",
  "timestamp": "2026-04-23T00:30:18.000Z"
}
```

**Price-increase record (subsequent run)**
```json
{
  "symbol": "BTC",
  "priceUsd": 78882,
  "previousPriceUsd": 78878,
  "deltaUsd": 4,
  "source": "coingecko",
  "timestamp": "2026-04-23T00:35:00.000Z"
}
```

---

## How the Price Rule Works

```
Every 5 minutes
└── For each symbol in [BTC, ETH]
        │
        ├── Fetch currentPrice from CoinGecko
        │
        ├── Query MongoDB: find latest stored record for symbol
        │       │
        │       ├── No record found?
        │       │       └── INSERT baseline (so next cycle has a reference)
        │       │
        │       ├── currentPrice > lastStoredPrice?
        │       │       └── INSERT new record with deltaUsd
        │       │
        │       └── currentPrice ≤ lastStoredPrice?
        │               └── SKIP — log reason, do not write to DB
        │
        └── On API failure → retry up to 3× with exponential back-off
                            → if all retries fail, skip this cycle entirely
```

**Key property:** Each symbol is compared independently. BTC may insert while ETH skips in the same cycle, and vice versa.

---

## Setup & Run

### Prerequisites

- **Node.js** v18 or later
- **MongoDB** — local instance or a MongoDB Atlas cluster

### 1. Install MongoDB locally (macOS)

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Or use a **MongoDB Atlas** free-tier cluster and set `MONGODB_URI` to the Atlas connection string.

### 2. Configure environment

```bash
cp .env.example .env
# Then edit .env and set MONGODB_URI to your connection string
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run the agent

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | **Yes** | — | Full MongoDB connection string. Local example: `mongodb://localhost:27017/crypto_prices`. Atlas example: `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `LOG_LEVEL` | No | `info` | Winston log level. Options: `error` \| `warn` \| `info` \| `debug` |
| `COINGECKO_BASE_URL` | No | `https://api.coingecko.com/api/v3` | Override for proxies or self-hosted mirrors |
| `API_TIMEOUT_MS` | No | `5000` | Milliseconds before an API request is aborted |
| `MAX_RETRIES` | No | `3` | Max CoinGecko fetch attempts before skipping a cycle |

---

## Verified Live Output

The following is real output captured from a live run against MongoDB Atlas:

```
2026-04-23 00:33:19 [info] [main] Starting crypto price monitor agent...
2026-04-23 00:33:19 [info] [database] Connected to MongoDB: mongodb+srv://...
2026-04-23 00:33:19 [info] [scheduler] Running initial cycle on startup...
2026-04-23 00:33:19 [info] [priceProcessor] Starting price check cycle...
2026-04-23 00:33:20 [info] [priceSourceClient] Fetched prices — BTC: $78878, ETH: $2393.22
2026-04-23 00:33:20 [info] [priceProcessor] BTC stored — $78878 (reason: baseline)
2026-04-23 00:33:20 [info] [priceProcessor] ETH stored — $2393.22 (reason: baseline)
2026-04-23 00:33:20 [info] [priceProcessor] Cycle complete.
2026-04-23 00:33:20 [info] [scheduler] Scheduler started — polling every 5 minutes.

# 5 minutes later — price increased, records inserted:
2026-04-23 00:35:00 [info] [priceProcessor] Starting price check cycle...
2026-04-23 00:35:00 [info] [priceSourceClient] Fetched prices — BTC: $78882, ETH: $2393.41
2026-04-23 00:35:00 [info] [priceProcessor] BTC stored — $78882 (reason: price_increase) delta: +$4
2026-04-23 00:35:00 [info] [priceProcessor] ETH stored — $2393.41 (reason: price_increase) delta: +$0.19
2026-04-23 00:35:00 [info] [priceProcessor] Cycle complete.
```

**Graceful shutdown on Ctrl+C:**
```
2026-04-23 00:33:15 [info] [main] Received SIGINT — shutting down gracefully...
2026-04-23 00:33:15 [info] [scheduler] Scheduler stopped.
2026-04-23 00:33:15 [info] [database] Disconnected from MongoDB
```

---

## MongoDB Queries

```js
// Connect
mongosh "mongodb://localhost:27017/crypto_prices"

// All BTC records, newest first
db.pricerecords.find({ symbol: "BTC" }).sort({ timestamp: -1 })

// All ETH records
db.pricerecords.find({ symbol: "ETH" }).sort({ timestamp: -1 })

// Latest record per symbol
db.pricerecords.find({ symbol: "BTC" }).sort({ timestamp: -1 }).limit(1)
db.pricerecords.find({ symbol: "ETH" }).sort({ timestamp: -1 }).limit(1)

// All records in the last hour
db.pricerecords.find({
  timestamp: { $gte: new Date(Date.now() - 3600 * 1000) }
}).sort({ timestamp: -1 })

// Count total inserts per symbol
db.pricerecords.aggregate([
  { $group: { _id: "$symbol", count: { $sum: 1 } } }
])

// List all indexes
db.pricerecords.getIndexes()
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **CoinGecko public API** | No API key required, reliable, supports both BTC and ETH in a single request (`/simple/price?ids=bitcoin,ethereum&vs_currencies=usd`), free tier sufficient for 5-min polling |
| **Insert-only on price increase** | Minimises storage — only meaningful upward movements are recorded. Each symbol is evaluated independently |
| **Baseline on first run** | Without a reference point the first real comparison would be impossible; baseline records establish the floor |
| **Unique index on (symbol, timestamp)** | Guards against accidental duplicate inserts if the process restarts mid-cycle or the scheduler fires twice |
| **Overlap guard in scheduler** | Prevents concurrent cycles from racing if a slow network response causes a cycle to exceed 5 minutes |
| **Exponential backoff on retries** | Avoids hammering a temporarily unavailable API; three attempts cover transient blips without delaying the cycle noticeably |
| **`process.exit(1)` on DB failure at startup** | Fail-fast is safer than silently running with no persistence; the error message is clear and actionable |
| **Graceful SIGINT/SIGTERM handling** | Ensures the cron job stops and the DB connection is closed cleanly, preventing zombie connections and data corruption |
| **Separate `previousPriceUsd` and `deltaUsd` fields** | Stored alongside each record so analytics queries don't require a self-join to compute the delta later |
