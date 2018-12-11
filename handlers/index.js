module.exports = function (api, config, redis, notifier, logger) {
  var feed = require('./feed')(config, redis, notifier, logger);

  api.messaging.listen('seguir-notify', function (msg, next) {
    if (msg.action === 'feed-view') return feed.view(msg, next);
    if (msg.action === 'feed-add') return feed.add(msg, next);
    if (msg.action === 'feed-remove') return feed.remove(msg, next);
    return next();
  });
};
