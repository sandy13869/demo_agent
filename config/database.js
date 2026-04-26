'use strict';

const mongoose = require('mongoose');
const logger = require('../logger');
const { MONGODB_URI } = require('./environment');

async function connect() {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const maskedUri = MONGODB_URI.replace(/:\/\/[^@]+@/, '://***:***@');
  logger.info(`[database] Connected to MongoDB: ${maskedUri}`);
}

async function disconnect() {
  await mongoose.disconnect();
  logger.info('[database] Disconnected from MongoDB');
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connect, disconnect, isConnected };
