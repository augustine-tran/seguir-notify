var async = require('async');
var _ = require('lodash');

module.exports = function (config) {

  var redis = require('../db/redis')(config);
  var usersKey = 'users';

  var addUser = function (user, next) {
    var userKey = ['user', user.user].join(':');
    var userNameKey = user.username ? ['username', user.username].join(':') : null;
    var userAltidKey = user.altid ? ['useraltid', user.altid].join(':') : null;
    user.userdata = JSON.stringify(user.userdata);
    user.timestamp = new Date();
    async.parallel([
      async.apply(redis.hmset.bind(redis), userKey, user),
      async.apply(redis.set.bind(redis), userNameKey, user.user),
      async.apply(redis.set.bind(redis), userAltidKey, user.user),
      async.apply(redis.lpush.bind(redis), usersKey, user.user)
    ], next);
  };

  var getUser = function (user, next) {
    var userKey = ['user', user].join(':');
    redis.hgetall(userKey, next);
  };

  var getUserByUsername = function (username, next) {
    var usernameKey = ['username', username].join(':');
    redis.get(usernameKey, function (err, user) {
      if (err) { return next(err); }
      getUser(user, next);
    });
  };

  var addItem = function (item, data, next) {
    var itemKey = ['item', item.item].join(':');
    item.data = JSON.stringify(data);
    redis.hmset(itemKey, item, next);
  };

  var addNotification = function (user, item, next) {
    var notifyKey = ['notify', user.user].join(':');
    redis.rpush(notifyKey, item.item, next);
  };

  var notificationToObject = function (notifications) {
    var fieldList = ['item', 'type', 'data'], fields, newObject, results = [];
    while (notifications.length > 0) {
      fields = _.take(notifications, fieldList.length);
      notifications = _.drop(notifications, fieldList.length);
      newObject = _.zipObject(fieldList, fields);
      newObject.data = JSON.parse(newObject.data);
      if (newObject.item) { results.push(newObject); }
    };
    return results;
  };

  var getUserStatus = function (user, next) {
    var userKey = ['user', user].join(':');
    var notifyKey = ['notify', user].join(':');
    async.parallel([
      async.apply(redis.hgetall.bind(redis), userKey),
      async.apply(redis.llen.bind(redis), notifyKey)
    ], next);
  };

  var getNotificationsForUser = function (user, next) {
    var notifyKey = ['notify', user].join(':');
    redis.sort(notifyKey, 'by', 'nosort', 'get', 'item:*->item', 'get', 'item:*->type', 'get', 'item:*->data', function (err, results) {
      if (err) { return next(err); }
      next(null, notificationToObject(results));
    });
  };

  var clearNotifications = function (user, next) {
    var notifyKey = ['notify', user.user].join(':');
    async.parallel([
      async.apply(redis.del.bind(redis), notifyKey),
      async.apply(redis.lrem.bind(redis), usersKey, 0, user.user)
    ], next);
  };

  var clearItem = function (user, item, next) {
    var itemKey = ['item', item.item].join(':');
    var notifyKey = ['notify', user.user].join(':');
    redis.del(itemKey, function () {
      redis.srem(notifyKey, item.item, next);
    });
  };

  return {
    _redis: redis,
    addUser: addUser,
    getUser: getUser,
    getUserByUsername: getUserByUsername,
    addItem: addItem,
    addNotification: addNotification,
    clearItem: clearItem,
    clearNotifications: clearNotifications,
    getNotificationsForUser: getNotificationsForUser,
    getUserStatus: getUserStatus
  };

};
