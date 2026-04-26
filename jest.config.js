'use strict';

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    'routes/**/*.js',
    'models/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      lines: 60,
      functions: 60,
    },
  },
};
