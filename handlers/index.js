module.exports = function (api, config) {

  var feed = require('./feed')(api, config);

  api.messaging.subscribe('feed-view', feed.view);
  api.messaging.subscribe('feed-add', feed.add);
  api.messaging.subscribe('feed-remove', feed.remove);

};
