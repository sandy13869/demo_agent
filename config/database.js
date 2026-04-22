'use strict';

const mongoose = require('mongoose');
const logger = require('../logger');
const { MONGODB_URI } = require('./environment');

async function connect() {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  logger.info(`[database] Connected to MongoDB: ${MONGODB_URI}`);
}

async function disconnect() {
  await mongoose.disconnect();
  logger.info('[database] Disconnected from MongoDB');
}

module.exports = { connect, disconnect };
