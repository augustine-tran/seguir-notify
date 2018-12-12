const _ = require('lodash');
const async = require('async');
const moment = require('moment');
const PAUSED = '_PAUSED_';
const DEFAULT_LIMIT = 20;
const keys = require('./keys');

module.exports = (config, redis, notifier, logger) => {
  const NOTIFICATION_PERIODS = config.notify.periods || [1, 3, 5];

  const stripNullProperties = obj => {
    const clone = Object.assign({}, obj);
    for (let p in clone) {
      if (!clone[p]) delete clone[p];
    }
    return clone;
  };

  /**
   * Adding a user ensures that the user exists in the notification db.
   */
  const addUser = (user, next) => {
    logger.log('addUser: ' + user);
    const userKey = keys.user(user.user);
    const userNameKey = user.username ? keys.username(user.username) : null;
    const userAltidKey = user.altid ? keys.useraltid(user.altid) : null;
    user.userdata = JSON.stringify(user.userdata || {});
    redis.multi()
      .hmset(userKey, stripNullProperties(user))
      .set(userNameKey, user.user)
      .set(userAltidKey, user.user)
      .exec(next);
  };

  /**
   * Use the current bucket period for user and date to create
   * a bucket key
   */
  const getBucketKey = (bucket, date) => {
    if (!bucket) {
      return;
    }
    if (typeof date === 'string') date = moment(date);
    const newDate = date.add(bucket, 'days').format('YYYYMMDD:HH');
    return keys.notifyBucket(newDate);
  };

  /**
   * Whenever a user views their feed move them into the right notification bucket
   */
  const moveUserNotificationBucket = (user, state, next) => {
    const isPaused = state.bucket_period === PAUSED;
    const nextBucket = isPaused ? null : getBucketKey(state.bucket_period, state.last_view);
    if (state.bucket_key && nextBucket === state.bucket_key) {
      return next();
    }

    const removeFromOldBucket = cb => {
      if (!state.bucket_key) {
        return cb();
      }
      redis.srem(state.bucket_key, user, cb);
    };

    const addToNewBucket = cb => {
      if (isPaused) {
        return cb();
      }
      redis.sadd(nextBucket, user, cb);
    };

    const updateUserState = cb => {
      const userViewStateKey = keys.viewState(user);
      if (isPaused) {
        redis.hdel(userViewStateKey, keys.BUCKET_KEY, cb);
      } else {
        redis.hmset(userViewStateKey, keys.BUCKET_KEY, nextBucket, cb);
      }
    };

    logger.log('move user from bucket ' + state.bucket_key + ' to ' + nextBucket);

    async.parallel([
      removeFromOldBucket,
      addToNewBucket,
      updateUserState
    ], next);
  };

  /**
   * Reset the view state after a view
   */
  const resetViewState = (user, next) => {
    logger.log('resetViewState: ' + user);
    const userViewStateKey = keys.viewState(user.user);

    redis.hgetall(userViewStateKey, (err, state) => {
      if (err) {
        return next(err);
      }
      const currentDate = moment().format();

      state = state || {
        last_view: currentDate,
        first_view: currentDate,
        bucket_period_index: 0
      };

      // move view state along
      state.previous_view = state.last_view;
      state.last_view = moment().format();

      // Always reset the bucket period back to minimum on a view
      state.bucket_period_index = 0;
      state.bucket_period = NOTIFICATION_PERIODS[state.bucket_period_index];

      // Update
      redis.hmset(userViewStateKey, state, err => {
        if (err) {
          return next(err);
        }
        moveUserNotificationBucket(user.user, state, next);
      });
    });
  };

  /**
   * After notifying a user push them out into the next notification bucket
   * This is reset if they view their feed.
   */
  const updateViewStateAfterNotifying = (user, next) => {
    logger.log('updateViewStateAfterNotifying: ' + user);
    const userViewStateKey = keys.viewState(user);

    redis.hgetall(userViewStateKey, (err, state) => {
      if (err || !state) {
        return next(err || 'No state for user: ' + user);
      }

      state.bucket_period_index = +state.bucket_period_index + 1;
      state.bucket_period = NOTIFICATION_PERIODS[state.bucket_period_index];

      if (!state.bucket_period) {
        state.bucket_period = PAUSED;
      }

      redis.hmset(userViewStateKey, keys.BUCKET_PERIOD, state.bucket_period, keys.BUCKET_PERIOD_INDEX, state.bucket_period_index, err => {
        if (err) {
          return next(err);
        }
        moveUserNotificationBucket(user, state, next);
      });
    });
  };

  /**
   * Get user details
   */
  const getUser = (user, next) => {
    const userKey = keys.user(user);
    redis.hgetall(userKey, (err, user) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return next({ statusCode: 404, message: 'User with id \'' + user + '\' not found' });
      }
      next(null, user);
    });
  };

  /**
   * Get users
   */
  const getUsers = next => {
    const userKey = keys.users;
    redis.smembers(userKey, (err, results) => {
      if (err) {
        return next(err);
      }
      async.map(results, getUserStatus, next);
    });
  };

  /**
   * Get user by username
   */
  const getUserByUsername = (username, next) => {
    const usernameKey = keys.username(username);
    redis.get(usernameKey, (err, user) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return next({ statusCode: 404, message: 'User with username \'' + username + '\' not found' });
      }
      getUser(user, next);
    });
  };

  /**
   * Get user by altid
   */
  const getUserByAltid = (altid, next) => {
    const altidKey = keys.useraltid(altid);
    redis.get(altidKey, (err, user) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return next({ statusCode: 404, message: 'User with altid \'' + altid + '\' not found' });
      }
      getUser(user, next);
    });
  };

  /**
   * Get user state - we won't write notifications unless
   * the user has a bucket that isn't paused.
   */
  const getUserState = (user, next) => {
    logger.log('getUserState: ' + user);
    const userViewStateKey = keys.viewState(user);
    redis.hget(userViewStateKey, keys.BUCKET_KEY, (err, bucket) => {
      if (err) {
        return next(err);
      }
      next(null, bucket && bucket !== PAUSED);
    });
  };

  /**
   * Get a summary of current user state and data
   */
  const getUserStatus = (user, next) => {
    logger.log('getUserStatus: ' + user);
    const userKey = keys.user(user);
    const notifyKey = keys.notify(user);
    const userViewStateKey = keys.viewState(user);
    redis.multi()
      .hgetall(userKey)
      .hgetall(userViewStateKey)
      .llen(notifyKey)
      .exec((err, result) => {
        if (err) { return next(err); }
        if (!result[0]) { return next({statusCode: 404, message: 'User with id \'' + user + '\' not found'}); }
        result[0].userdata = JSON.parse(result[0].userdata || '{}');
        result[0].state = result[1];
        result[0].notifications = result[2];
        next(null, result[0]);
      });
  };

  /**
   * Persist an item that will form part of a notification
   */
  const addItem = (item, data, next) => {
    logger.log('addItem: ' + item);
    const itemKey = keys.item(item.item);
    item.data = JSON.stringify(data);
    redis.hmset(itemKey, item, next);
  };

  /**
   * Add an item to the notification list for a specific user, keep the list limited
   */
  const addNotification = (user, item, next) => {
    logger.log('addNotification: ' + user + ' : ' + item);
    const notifyKey = keys.notify(user.user);
    redis.multi()
      .lpush(notifyKey, item.item)
      .ltrim(notifyKey, 0, config.notify.limit || DEFAULT_LIMIT)
      .sadd(keys.users, user.user)
      .exec(next);
  };

  /**
   * Convert the result from the SORT BY back into an array of items
   */
  const sortByToObject = (fieldList, notifications) => {
    let fields;
    let newObject;
    const results = [];
    while (notifications.length > 0) {
      fields = _.take(notifications, fieldList.length);
      notifications = _.drop(notifications, fieldList.length);
      newObject = _.zipObject(fieldList, fields);
      if (newObject.data) newObject.data = JSON.parse(newObject.data);
      if (newObject[fieldList[0]]) {
        results.push(newObject);
      }
    }
    return results;
  };

  /**
   * Get a list of all notifications active for the current user
   */
  const getNotificationsForUser = (user, next) => {
    const notifyKey = keys.notify(user);
    redis.sort(notifyKey, 'by', 'nosort', 'get', 'item:*->item', 'get', 'item:*->type', 'get', 'item:*->data', (err, results) => {
      if (err) {
        return next(err);
      }
      next(null, sortByToObject(['item', 'type', 'data'], results));
    });
  };

  /**
   * Get a list of users active within a specific notification bucket
   */
  const getUsersForBucket = (bucket, next) => {
    const bucketKey = keys.notifyBucket(bucket);
    redis.smembers(bucketKey, (err, results) => {
      next(err, results);
    });
  };

  /**
   * Trigger the notifier callback for a specific user, with all of their pending
   * notifications.
   */
  const notifyUser = (user, next) => {
    logger.log('notifyUser: ' + user);
    getUserStatus(user, (err, userObject) => {
      if (err) {
        return next(err);
      }
      getNotificationsForUser(user, (err, notifications) => {
        if (err) {
          return next(err);
        }
        if (notifier) {
          notifier(userObject, notifications);
        }
        clearNotifications(user, err => {
          next(err, notifications.length);
        });
      });
    });
  };

  /**
   * Notify all users currently active within a specific bucket.
   */
  const notifyUsersForBucket = (bucket, next) => {
    logger.log('notifyUsersForBucket: ' + bucket);
    getUsersForBucket(bucket, (err, users) => {
      if (err) {
        return next(err);
      }
      async.map(users, notifyUser, (err, result) => {
        if (err) {
          return next(err);
        }
        async.map(users, updateViewStateAfterNotifying, err => {
          if (err) {
            return next(err);
          }
          next(null, { users: users.length, notifications: result });
        });
      });
    });
  };

  /**
   * Clear all pending notifications for a specific user and remove from
   * pending users list.
   */
  const clearNotifications = (user, next) => {
    logger.log('clearNotifications: ' + user);
    const notifyKey = keys.notify(user);
    redis.multi()
      .del(notifyKey)
      .srem('users', user)
      .exec(next);
  };

  /**
   * Clear a specific item from a users notification list
   */
  const clearItem = (user, item, next) => {
    logger.log('clearItem: ' + user + ' : ' + item);
    const itemKey = keys.item(item);
    const notifyKey = keys.notify(user);
    redis.multi()
      .del(itemKey)
      .lrem(notifyKey, 0, item)
      .exec(next);
  };

  return {
    _redis: redis,
    addUser,
    getUser,
    getUsers,
    getUserState,
    getUserByUsername,
    getUserByAltid,
    addItem,
    resetViewState,
    addNotification,
    clearItem,
    clearNotifications,
    getNotificationsForUser,
    getUsersForBucket,
    notifyUsersForBucket,
    getUserStatus
  };
};
