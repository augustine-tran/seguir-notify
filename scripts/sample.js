var fixtures = require('../tests/fixtures');
var async = require('async');
var config = require('../config')();
var Redis = require('../db/redis');

Redis(config, function (err, redis) {
  if (err) {};
  var feed = require('../handlers/feed')(config, redis);
  async.map(fixtures['feed-view'], feed.view, function () {
    async.map(fixtures['feed-add'], feed.add, function () {
      console.log('DONE!');
      redis.end();
    });
  });
});
