const Redis = require('ioredis');
const config = require('../config');

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

redis.on('error', (err) => {
  console.error('[redis] error', err.message);
});

module.exports = redis;
