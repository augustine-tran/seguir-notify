module.exports = {
  'user': user => ['user', user].join(':'),
  'username': username => ['username', username].join(':'),
  'useraltid': altid => ['useraltid', altid].join(':'),
  'item': item => ['item', item].join(':'),
  'notify': user => ['notify', user].join(':'),
  'notifyBucket': date => ['notify', 'bucket', date].join(':'),
  'viewState': user => ['user', 'state', user].join(':'),
  'users': 'users',
  BUCKET_KEY: 'bucket_key',
  BUCKET_PERIOD: 'bucket_period',
  BUCKET_PERIOD_INDEX: 'bucket_period_index'
};
