var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var NOTIFICATION_PERIODS = [1, 3, 5];

module.exports = function (config, redis, notifier) {

  var usersKey = 'users';

  /**
   * Adding a user ensures that the user exists in the notification db.
   */
  var addUser = function (user, next) {

    var userKey = ['user', user.user].join(':');
    var userNameKey = user.username ? ['username', user.username].join(':') : null;
    var userAltidKey = user.altid ? ['useraltid', user.altid].join(':') : null;
    user.userdata = JSON.stringify(user.userdata);
    redis.multi()
        .hmset(userKey, user)
        .set(userNameKey, user.user)
        .set(userAltidKey, user.user)
        .sadd(usersKey, user.user)
        .exec(next);

  };

   /**
   * Whenever a user views their feed move them into the right notification bucket
   */
  var moveUserNotificationBucket = function (user, state, next) {

    var isPaused = state.bucket_period === '_PAUSED_';
    var nextBucket = isPaused ? null : getBucketKey(state.bucket_period, state.last_view);
    if (state.bucket_key && nextBucket === state.bucket_key) { return next(); }

    var removeFromOldBucket = function (cb) {
      if (!state.bucket_key) { return cb(); }
      redis.srem(state.bucket_key, user, cb);
    };

    var addToNewBucket = function (cb) {
      if (isPaused) { return cb(); }
      redis.sadd(nextBucket, user, cb);
    };

    var updateUserState = function (cb) {
      var userViewStateKey = ['user', 'state', user].join(':');
      if (isPaused) {
        redis.hdel(userViewStateKey, 'bucket_key', cb);
      } else {
        redis.hmset(userViewStateKey, 'bucket_key', nextBucket, cb);
      }
    };

    async.parallel([
      removeFromOldBucket,
      addToNewBucket,
      updateUserState
    ], next);

  };

  var getBucketKey = function (bucket, date) {
    if (!bucket) { return; }
    if (typeof date === 'string') date = moment(date);
    var newDate = date.add(bucket, 'days').format('YYYYMMDD:HH');
    return ['notify', 'bucket', newDate].join(':');
  };

  /**
   * Update the state of the user after a new view
   */
  var updateViewState = function (user, next) {

    var userViewStateKey = ['user', 'state', user.user].join(':');

    redis.hgetall(userViewStateKey, function (err, state) {

      if (err) { return next(err); }
      var current_date = moment().format();

      state = state || {
        last_view: current_date,
        first_view: current_date,
        bucket_period_index: 0
      };

      // move view state along
      state.previous_view = state.last_view;
      state.last_view = moment().format();

      // Always reset the bucket period back to minimum on a view
      state.bucket_period_index = 0;
      state.bucket_period = NOTIFICATION_PERIODS[state.bucket_period_index];

      // Update
      redis.hmset(userViewStateKey, state, function (err) {
        if (err) { return next(err); }
        moveUserNotificationBucket(user.user, state, next);
      });

    });

  };

  /**
   * After notifying a user update their view state
   */
  var updateViewStateAfterNotifying = function (user, next) {

    var userViewStateKey = ['user', 'state', user].join(':');

    redis.hgetall(userViewStateKey, function (err, state) {

      if (err || !state) { return next(err || 'No state for user: ' + user); }

      state.bucket_period_index = +state.bucket_period_index + 1;
      state.bucket_period = NOTIFICATION_PERIODS[state.bucket_period_index];

      if (!state.bucket_period) {
        state.bucket_period = '_PAUSED_';
      }

      redis.hmset(userViewStateKey, 'bucket_period', state.bucket_period, 'bucket_period_index', state.bucket_period_index, function (err) {
        if (err) { return next(err); }
        moveUserNotificationBucket(user, state, next);
      });

    });

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
    var userViewStateKey = ['user', 'state', user].join(':');

    redis.multi()
      .hgetall(userKey)
      .hgetall(userViewStateKey)
      .llen(notifyKey)
      .exec(function (err, result) {
        if (err) { return next(err); }
        result[0].state = result[1];
        result[0].notifications = result[2];
        next(null, result[0]);
      });

  };

  var getNotificationsForUser = function (user, next) {
    var notifyKey = ['notify', user].join(':');
    redis.sort(notifyKey, 'by', 'nosort', 'get', 'item:*->item', 'get', 'item:*->type', 'get', 'item:*->data', function (err, results) {
      if (err) { return next(err); }
      next(null, notificationToObject(results));
    });
  };

  var getUsersForBucket = function (bucket, next) {
    var bucketKey = ['notify', 'bucket', bucket].join(':');
    redis.smembers(bucketKey, function (err, results) {
      next(err, results);
    });
  };

  var notifyUser = function (user, next) {
    getNotificationsForUser(user, function (err, notifications) {
      if (err) { return next(err); }
      clearNotifications(user, function (err) {
        next(err, notifications.length);
      });;
    });
  };

  var notifyUsersForBucket = function (bucket, next) {
    getUsersForBucket(bucket, function (err, users) {
      if (err) { return next(err); }
      // TODO: Get a collection of all notifications
      async.map(users, notifyUser, function (err, result) {
        if (err) { return next(err); }
        async.map(users, updateViewStateAfterNotifying, function (err) {
          if (err) { return next(err); }
          next(null, {users: users.length, notifications: result});
        });;
      });
    });
  };

  var clearNotifications = function (user, next) {
    var notifyKey = ['notify', user].join(':');
    redis.multi()
      .del(notifyKey)
      .srem(usersKey, user)
      .exec(next);
  };

  var clearItem = function (user, item, next) {
    var itemKey = ['item', item].join(':');
    var notifyKey = ['notify', user].join(':');
    redis.multi()
      .del(itemKey)
      .lrem(notifyKey, 0, item)
      .exec(next);
  };

  return {
    _redis: redis,
    addUser: addUser,
    getUser: getUser,
    getUserByUsername: getUserByUsername,
    addItem: addItem,
    updateViewState: updateViewState,
    addNotification: addNotification,
    clearItem: clearItem,
    clearNotifications: clearNotifications,
    getNotificationsForUser: getNotificationsForUser,
    getUsersForBucket: getUsersForBucket,
    notifyUsersForBucket: notifyUsersForBucket,
    getUserStatus: getUserStatus
  };

};
