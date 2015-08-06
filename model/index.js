var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var PAUSED = '_PAUSED_';
var DEFAULT_LIMIT = 20;
var keys = require('./keys');

module.exports = function (config, redis, notifier) {

  var NOTIFICATION_PERIODS = config.notify.periods || [1, 3, 5];

  /**
   * Adding a user ensures that the user exists in the notification db.
   */
  var addUser = function (user, next) {

    var userKey = keys.user(user.user);
    var userNameKey = user.username ? keys.username(user.username) : null;
    var userAltidKey = user.altid ? keys.useraltid(user.altid) : null;
    user.userdata = JSON.stringify(user.userdata);

    var multiCmd = redis.multi()
        .hmset(userKey, user);

    if (userNameKey) multiCmd.set(userNameKey, user.user);
    if (userAltidKey) multiCmd.set(userAltidKey, user.user);

    multiCmd.exec(next);

  };

  /**
   * Use the current bucket period for user and date to create
   * a bucket key
   */
  var getBucketKey = function (bucket, date) {
    if (!bucket) { return; }
    if (typeof date === 'string') date = moment(date);
    var newDate = date.add(bucket, 'days').format('YYYYMMDD:HH');
    return keys.notifyBucket(newDate);
  };

  /**
   * Whenever a user views their feed move them into the right notification bucket
   */
  var moveUserNotificationBucket = function (user, state, next) {

    var isPaused = state.bucket_period === PAUSED;
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
      var userViewStateKey = keys.viewState(user);
      if (isPaused) {
        redis.hdel(userViewStateKey, keys.BUCKET_KEY, cb);
      } else {
        redis.hmset(userViewStateKey, keys.BUCKET_KEY, nextBucket, cb);
      }
    };

    async.parallel([
      removeFromOldBucket,
      addToNewBucket,
      updateUserState
    ], next);

  };

  /**
   * Reset the view state after a view
   */
  var resetViewState = function (user, next) {

    var userViewStateKey = keys.viewState(user.user);

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
   * After notifying a user push them out into the next notification bucket
   * This is reset if they view their feed.
   */
  var updateViewStateAfterNotifying = function (user, next) {

    var userViewStateKey = keys.viewState(user);

    redis.hgetall(userViewStateKey, function (err, state) {

      if (err || !state) { return next(err || 'No state for user: ' + user); }

      state.bucket_period_index = +state.bucket_period_index + 1;
      state.bucket_period = NOTIFICATION_PERIODS[state.bucket_period_index];

      if (!state.bucket_period) {
        state.bucket_period = PAUSED;
      }

      redis.hmset(userViewStateKey, keys.BUCKET_PERIOD, state.bucket_period, keys.BUCKET_PERIOD_INDEX, state.bucket_period_index, function (err) {
        if (err) { return next(err); }
        moveUserNotificationBucket(user, state, next);
      });

    });

  };

  /**
   * Get user details
   */
  var getUser = function (user, next) {
    var userKey = keys.user(user);
    redis.hgetall(userKey, next);
  };

  /**
   * Get users
   */
  var getUsers = function (next) {
    var userKey = keys.users;
    redis.smembers(userKey, function (err, results) {
      if (err) { return next(err); }
      async.map(results, getUserStatus, next);
    });
  };

  /**
   * Get user by username
   */
  var getUserByUsername = function (username, next) {
    var usernameKey = keys.username(username);
    redis.get(usernameKey, function (err, user) {
      if (err) { return next(err); }
      getUser(user, next);
    });
  };

  /**
   * Get user state - we won't write notifications unless
   * the user has a bucket that isn't paused.
   */
  var getUserState = function (user, next) {
    var userViewStateKey = keys.viewState(user);
    redis.hget(userViewStateKey, keys.BUCKET_KEY, function (err, bucket) {
      if (err) { return next(err); }
      next(null, bucket && bucket !== PAUSED);
    });
  };

  /**
   * Get a summary of current user state and data
   */
  var getUserStatus = function (user, next) {
    var userKey = keys.user(user);
    var notifyKey = keys.notify(user);
    var userViewStateKey = keys.viewState(user);
    redis.multi()
      .hgetall(userKey)
      .hgetall(userViewStateKey)
      .llen(notifyKey)
      .exec(function (err, result) {
        if (err) { return next(err); }
        result[0].userdata = JSON.parse(result[0].userdata || '{}');
        result[0].state = result[1];
        result[0].notifications = result[2];
        next(null, result[0]);
      });
  };

  /**
   * Persist an item that will form part of a notification
   */
  var addItem = function (item, data, next) {
    var itemKey = keys.item(item.item);
    item.data = JSON.stringify(data);
    redis.hmset(itemKey, item, next);
  };

  /**
   * Add an item to the notification list for a specific user, keep the list limited
   */
  var addNotification = function (user, item, next) {
    var notifyKey = keys.notify(user.user);
    redis.multi()
      .lpush(notifyKey, item.item)
      .ltrim(notifyKey, 0, config.notify.limit || DEFAULT_LIMIT)
      .sadd(keys.users, user.user)
      .exec(next);
  };

  /**
   * Convert the result from the SORT BY back into an array of items
   */
  var sortByToObject = function (fieldList, notifications) {
    var fields, newObject, results = [];
    while (notifications.length > 0) {
      fields = _.take(notifications, fieldList.length);
      notifications = _.drop(notifications, fieldList.length);
      newObject = _.zipObject(fieldList, fields);
      if (newObject.data) newObject.data = JSON.parse(newObject.data);
      if (newObject[fieldList[0]]) { results.push(newObject); }
    };
    return results;
  };

  /**
   * Get a list of all notifications active for the current user
   */
  var getNotificationsForUser = function (user, next) {
    var notifyKey = keys.notify(user);
    redis.sort(notifyKey, 'by', 'nosort', 'get', 'item:*->item', 'get', 'item:*->type', 'get', 'item:*->data', function (err, results) {
      if (err) { return next(err); }
      next(null, sortByToObject(['item', 'type', 'data'], results));
    });
  };

  /**
   * Get a list of users active within a specific notification bucket
   */
  var getUsersForBucket = function (bucket, next) {
    var bucketKey = keys.notifyBucket(bucket);
    redis.smembers(bucketKey, function (err, results) {
      next(err, results);
    });
  };

  /**
   * Trigger the notifier callback for a specific user, with all of their pending
   * notifications.
   */
  var notifyUser = function (user, next) {
    getUser(user, function (err, userObject) {
      if (err) { return next(err); }
      getNotificationsForUser(user, function (err, notifications) {
        if (err) { return next(err); }
        notifier && notifier(userObject, notifications);
        clearNotifications(user, function (err) {
          next(err, notifications.length);
        });
      });
    });
  };

  /**
   * Notify all users currently active within a specific bucket.
   */
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

  /**
   * Clear all pending notifications for a specific user and remove from
   * pending users list.
   */
  var clearNotifications = function (user, next) {
    var notifyKey = keys.notify(user);
    redis.multi()
      .del(notifyKey)
      .srem('users', user)
      .exec(next);
  };

  /**
   * Clear a specific item from a users notification list
   */
  var clearItem = function (user, item, next) {
    var itemKey = keys.item(item);
    var notifyKey = keys.notify(user);
    redis.multi()
      .del(itemKey)
      .lrem(notifyKey, 0, item)
      .exec(next);
  };

  return {
    _redis: redis,
    addUser: addUser,
    getUser: getUser,
    getUsers: getUsers,
    getUserState: getUserState,
    getUserByUsername: getUserByUsername,
    addItem: addItem,
    resetViewState: resetViewState,
    addNotification: addNotification,
    clearItem: clearItem,
    clearNotifications: clearNotifications,
    getNotificationsForUser: getNotificationsForUser,
    getUsersForBucket: getUsersForBucket,
    notifyUsersForBucket: notifyUsersForBucket,
    getUserStatus: getUserStatus
  };

};
