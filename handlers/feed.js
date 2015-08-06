var async = require('async');

module.exports = function (config, redis) {

  var model = require('../model')(config, redis);

  var view = function (msg, next) {
    async.parallel([
      async.apply(model.addUser, msg.user),
      async.apply(model.resetViewState, msg.user),
      async.apply(model.clearNotifications, msg.user.user)
    ], next);
  };

  var add = function (msg, next) {
    async.parallel([
      async.apply(model.addUser, msg.user),
      async.apply(model.addItem, msg.item, msg.data),
      async.apply(model.addNotification, msg.user, msg.item)
    ], next);
  };

  var remove = function (msg, next) {
    async.parallel([
      async.apply(model.clearItem, msg.user.user, msg.item.item)
    ], next);
  };

  return {
    view: view,
    add: add,
    remove: remove
  };

};
