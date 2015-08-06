var restify = require('restify');
var moment = require('moment');

module.exports = function (server, api, config, redis, notifier) {

  var model = require('../model')(config, redis, notifier);

  function _error (err) {
    return new restify.HttpError(err);
  }

  server.get('/', function (req, res, cb) {
    res.send({status: 'Seguir Notify'});
    cb();
  });

  server.get('/users', function (req, res, cb) {
    model.getUsers(function (err, users) {
      if (err) { return _error(err); }
      res.send(users);
    });
  });

  server.get('/user/:username', function (req, res, cb) {
    model.getUserByUsername(req.params.username, function (err, user) {
      if (err) { return _error(err); }
      model.getUserStatus(user.user, function (err, status) {
        if (err) { return _error(err); }
        status.userdata = JSON.parse(status.userdata);
        res.send(status);
      });

    });
  });

  server.get('/notify', function (req, res, cb) {
    var bucket = moment().format('YYYYMMDD:HH');
    model.notifyUsersForBucket(bucket, function (err, status) {
      if (err) { return _error(err); }
      res.send(status);
    });
  });

  server.get('/notify/:bucket?', function (req, res, cb) {
    var bucket = req.params.bucket;
    model.notifyUsersForBucket(bucket, function (err, status) {
      if (err) { return _error(err); }
      res.send(status);
    });
  });

};
