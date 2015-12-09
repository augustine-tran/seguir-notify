var _ = require('lodash');
var redis = require('redis');

module.exports = function client (config, next) {
  var redisConfig = config && config.notify ? config.notify : {};
  redisConfig = _.defaults(config && config.notify || {}, { host: 'localhost', port: 6379, options: { } });
  redisConfig.options.retry_max_delay = redisConfig.options.retry_max_delay || 10000;

  var redisClient = redis.createClient(redisConfig.port, redisConfig.host, redisConfig.options);

  redisClient.on('error', function (err) {
    console.error('Error connecting to redis [%s:%s] - %s', redisConfig.host, redisConfig.port, err.message);
  });

  redisClient.on('ready', function () {
    if (redisConfig.db) {
      redisClient.select(redisConfig.db, function () {
        next(null, redisClient);
      });
    } else {
      next(null, redisClient);
    }
  });
};
