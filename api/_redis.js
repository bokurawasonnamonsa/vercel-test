const Redis = require('ioredis');

let client;

function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
    });
  }
  return client;
}

module.exports = { getClient };
