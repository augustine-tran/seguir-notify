var async = require('async');

module.exports = function (api, config) {

  var redis = require('../db/redis')(config),
      SEVEN_DAYS = 3600 * 24 * 7,
      EXPIRE = config.redis && config.redis.ttl || SEVEN_DAYS;

  var _user = function (user, next) {
    var userKey = ['user', user.user].join(':');
    var userNameKey = user.username ? ['username', user.username].join(':') : null;
    var userAltidKey = user.altid ? ['useraltid', user.altid].join(':') : null;
    user.userdata = JSON.stringify(user.userdata);
    user.timestamp = new Date();
    async.parallel([
      async.apply(redis.hmset.bind(redis), userKey, user),
      async.apply(redis.set.bind(redis), userNameKey, user.user),
      async.apply(redis.set.bind(redis), userAltidKey, user.user),
      async.apply(redis.expire.bind(redis), userKey, EXPIRE),
      async.apply(redis.expire.bind(redis), userNameKey, EXPIRE),
      async.apply(redis.expire.bind(redis), userAltidKey, EXPIRE)
    ], next);
  };

  var _item = function (item, data, next) {
    var itemKey = ['item', item.item].join(':');
    item.user = JSON.stringify(item.user);
    redis.hmset(itemKey, data, function () {
      redis.expire(itemKey, EXPIRE, next);
    });
  };

  var _notify = function (user, item, next) {
    var notifyKey = ['notify', user.user].join(':');
    redis.sadd(notifyKey, item.item, function () {
      redis.expire(notifyKey, EXPIRE, next);
    });
  };

  var _clear = function (user, next) {
    var notifyKey = ['notify', user.user].join(':');
    redis.del(notifyKey, next);
  };

  var _clearItem = function (user, item, next) {
    var itemKey = ['item', item.item].join(':');
    var notifyKey = ['notify', user.user].join(':');
    redis.del(itemKey, function () {
      redis.srem(notifyKey, item.item, next);
    });
  };

  var view = function (msg) {
    async.parallel([
      async.apply(_user, msg.user),
      async.apply(_clear, msg.user)
    ], function () {
      //
    });
  };

  var add = function (msg) {
    async.parallel([
      async.apply(_item, msg.item, msg.data),
      async.apply(_notify, msg.user, msg.item)
    ], function () {
      //
    });
  };

  var remove = function (msg) {
    async.parallel([
      async.apply(_clearItem, msg.user, msg.item)
    ], function () {
      //
    });
  };

  return {
    view: view,
    add: add,
    remove: remove
  };

};
