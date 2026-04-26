'use strict';

// Must be set before any module is loaded so environment.js validation passes
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
