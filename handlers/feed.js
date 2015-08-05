var async = require('async');

module.exports = function (api, config) {

  var model = require('../model')(config);

  var view = function (msg) {
    async.parallel([
      async.apply(model.addUser, msg.user),
      async.apply(model.clearNotifications, msg.user)
    ], function (err, result) {
      console.log(JSON.stringify(err, null, 2));
      console.log(JSON.stringify(result, null, 2));
    });
  };

  var add = function (msg) {
    async.parallel([
      async.apply(model.addItem, msg.item, msg.data),
      async.apply(model.addNotification, msg.user, msg.item)
    ], function (err, result) {
      console.log(JSON.stringify(err, null, 2));
      console.log(JSON.stringify(result, null, 2));
    });
  };

  var remove = function (msg) {
    async.parallel([
      async.apply(model.clearItem, msg.user, msg.item)
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
