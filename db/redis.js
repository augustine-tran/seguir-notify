const _ = require('lodash');
const redis = require('redis');

module.exports = (config, next) => {
  let redisConfig = config && config.notify ? config.notify : {};
  redisConfig = _.defaults((config && config.notify) || {}, { host: 'localhost', port: 6379, options: { } });
  const redisClient = redis.createClient(redisConfig.port, redisConfig.host, redisConfig.options);

  redisClient.on('error', err => {
    console.error('Error connecting to redis [%s:%s] - %s', redisConfig.host, redisConfig.port, err.message);
  });

  redisClient.on('ready', () => {
    if (redisConfig.db) {
      redisClient.select(redisConfig.db, () => {
        next(null, redisClient);
      });
    } else {
      next(null, redisClient);
    }
  });
};
