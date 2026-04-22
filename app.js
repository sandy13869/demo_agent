'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const pricesRouter = require('./routes/prices');

const app = express();
app.use(express.json());

// ── Swagger / OpenAPI setup ───────────────────────────────────────────────────
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Crypto Price Monitor API',
    version: '1.0.0',
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
      url: 'http://localhost:{port}',
      description: 'Local development server',
      variables: {
        port: { default: '3000', description: 'HTTP port (set via PORT env var)' },
      },
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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Crypto Price Monitor — API Docs',
}));

// Raw OpenAPI JSON (useful for tools like Postman, Insomnia)
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     description: Returns the current status of the agent and the server timestamp.
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
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-04-23T00:35:00.000Z"
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                   example: 300.42
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: parseFloat(process.uptime().toFixed(2)),
  });
});

app.use('/api/prices', pricesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

module.exports = app;
