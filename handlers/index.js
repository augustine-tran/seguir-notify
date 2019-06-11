module.exports = (api, config, redis, notifier) => {
  const feed = require('./feed')(config, redis, notifier);

  api.messaging.listen('seguir-notify', (msg, next) => {
    if (msg.action === 'feed-view') return feed.view(msg, next);
    if (msg.action === 'feed-add') return feed.add(msg, next);
    if (msg.action === 'feed-remove') return feed.remove(msg, next);
    return next();
  });
};
