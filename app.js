'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const { PORT, CORS_ORIGIN, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, NODE_ENV } = require('./config/environment');
const { isConnected } = require('./config/database');
const logger = require('./logger');
const { version } = require('./package.json');

const pricesRouter = require('./routes/prices');

const app = express();

// ── Security & performance middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(compression());
app.use(express.json());

// Request logger (skip in test env to keep output clean)
if (NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    logger.info(`[http] ${req.method} ${req.path}`);
    next();
  });
}

// Rate limiter applied to all /api/* routes
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down and try again later.' },
});
app.use('/api/', apiLimiter);

// ── Swagger / OpenAPI setup ───────────────────────────────────────────────────
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Crypto Price Monitor API',
    version,
    description:
      'REST API for querying BTC and ETH price records stored by the local ' +
      'price-monitor agent. Records are inserted only when the current price ' +
      'exceeds the last stored price for that symbol (sourced from CoinGecko).',
    contact: {
      name: 'demo_agent',
      url: 'https://github.com/sandy13869/demo_agent',
    },
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Local development server',
    },
  ],
  tags: [
    {
      name: 'Prices',
      description: 'Price record queries — latest, history, and aggregate stats',
    },
    {
      name: 'Health',
      description: 'Service liveness check',
    },
  ],
};

const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: [
    path.join(__dirname, 'routes/*.js'),
    path.join(__dirname, 'app.js'),
  ],
});

// ── API Routes ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     description: Returns the current liveness status, DB connectivity, and runtime details.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-04-23T00:35:00.000Z"
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                   example: 300.42
 *                 database:
 *                   type: string
 *                   enum: [connected, disconnected]
 *                   example: connected
 *                 memory:
 *                   type: object
 *                   properties:
 *                     heapUsedMb:
 *                       type: number
 *                       example: 42.1
 *                     heapTotalMb:
 *                       type: number
 *                       example: 64.0
 */
app.get('/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    version,
    timestamp: new Date().toISOString(),
    uptime: parseFloat(process.uptime().toFixed(2)),
    database: isConnected() ? 'connected' : 'disconnected',
    memory: {
      heapUsedMb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(1)),
    },
  });
});

app.use('/api/prices', pricesRouter);

// Raw OpenAPI JSON — useful for Postman / Insomnia import
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Landing page
app.get('/', (_req, res) => {
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crypto Price Monitor</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 32px; background: #f7fafc; color: #111827; }
    .card { max-width: 640px; margin: 40px auto; background: #ffffff; border-radius: 14px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    .tag { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #16a34a; color: #ffffff; font-weight: 700; font-size: 12px; letter-spacing: 0.4px; }
    h1 { margin: 16px 0 8px; font-size: 24px; }
    p { margin: 0 0 16px; color: #374151; }
    a { color: #0f766e; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .version { font-size: 12px; color: #9ca3af; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="tag">SERVER RUNNING</span>
    <h1>Crypto Price Monitor API</h1>
    <p>Service started successfully. Swagger docs are available below.</p>
    <a href="/api-docs">Open API Docs</a>
    <p class="version">v${version}</p>
  </div>
</body>
</html>`);
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Crypto Price Monitor — API Docs',
  swaggerUrl: '/api-docs.json',
  explorer: true,
}));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error(`[http] Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
