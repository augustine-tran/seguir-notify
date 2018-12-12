const async = require('async');

module.exports = (config, redis, notifier, logger) => {
  const model = require('../model')(config, redis, notifier, logger);

  const view = (msg, next) => {
    async.parallel([
      async.apply(model.addUser, msg.user),
      async.apply(model.resetViewState, msg.user),
      async.apply(model.clearNotifications, msg.user.user)
    ], next);
  };

  const add = (msg, next) => {
    model.getUserState(msg.user.user, (err, active) => {
      if (err) { return next(err); }
      if (!active) { return next(null); }
      async.parallel([
        async.apply(model.addItem, msg.item, msg.data),
        async.apply(model.addNotification, msg.user, msg.item)
      ], next);
    });
  };

  const remove = (msg, next) => {
    async.parallel([
      async.apply(model.clearItem, msg.user.user, msg.item.item)
    ], next);
  };

  return {
    view,
    add,
    remove
  };
};
