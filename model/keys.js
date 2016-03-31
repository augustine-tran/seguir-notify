module.exports = {
  'user': function (user) {
    return ['user', user].join(':');
  },
  'username': function (username) {
    return ['username', username].join(':');
  },
  'useraltid': function (altid) {
    return ['useraltid', altid].join(':');
  },
  'item': function (item) {
    return ['item', item].join(':');
  },
  'notify': function (user) {
    return ['notify', user].join(':');
  },
  'notifyBucket': function (date) {
    return ['notify', 'bucket', date].join(':');
  },
  'viewState': function (user) {
    return ['user', 'state', user].join(':');
  },
  'users': 'users',
  BUCKET_KEY: 'bucket_key',
  BUCKET_PERIOD: 'bucket_period',
  BUCKET_PERIOD_INDEX: 'bucket_period_index'
};
