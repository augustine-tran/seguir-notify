var async = require('async');

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
    item.user = JSON.stringify(item.user);
    redis.hmset(itemKey, data, next);
  };

  var addNotification = function (user, item, next) {
    var notifyKey = ['notify', user.user].join(':');
    redis.sadd(notifyKey, item.item, next);
  };

  var clearNotifications = function (user, next) {
    var notifyKey = ['notify', user.user].join(':');
    async.parallel([
      async.apply(redis.del.bind(redis), notifyKey),
      async.apply(redis.lrem.bind(redis), usersKey, user.user)
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
    addUser: addUser,
    getUser: getUser,
    getUserByUsername: getUserByUsername,
    addItem: addItem,
    addNotification: addNotification,
    clearItem: clearItem,
    clearNotifications: clearNotifications
  };

};
