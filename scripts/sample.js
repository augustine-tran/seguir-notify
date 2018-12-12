const fixtures = require('../tests/fixtures');
const async = require('async');
const config = require('../config')();
const Redis = require('../db/redis');

Redis(config, (err, redis) => {
  if (err) {}
  const feed = require('../handlers/feed')(config, redis);
  async.map(fixtures['feed-view'], feed.view, () => {
    async.map(fixtures['feed-add'], feed.add, () => {
      console.log('DONE!');
      redis.end();
    });
  });
});
