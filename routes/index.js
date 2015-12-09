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

  server.get('/user/:user', function (req, res, cb) {
    model.getUserStatus(req.params.user, function (err, status) {
      if (err) { return cb(_error(err)); }
      if (!status) { return cb(_error({statusCode: 404, message: 'User with id \'' + req.params.user + '\' not found'})); }
      res.send(status);
    });
  });

  server.get('/useraltid/:altid', function (req, res, cb) {
    model.getUserByAltid(req.params.altid, function (err, user) {
      if (err) { return cb(_error(err)); }
      if (!user) { return cb(_error({statusCode: 404, message: 'User with altId \'' + req.params.altid + '\' not found'})); }
      model.getUserStatus(user.user, function (err, status) {
        if (err) { return cb(_error(err)); }
        res.send(status);
      });
    });
  });

  server.get('/username/:username', function (req, res, cb) {
    model.getUserByUsername(req.params.username, function (err, user) {
      if (err) { return cb(_error(err)); }
      if (!user) { return cb(_error({statusCode: 404, message: 'User with username \'' + req.params.username + '\' not found'})); }
      model.getUserStatus(user.user, function (err, status) {
        if (err) { return cb(_error(err)); }
        res.send(status);
      });
    });
  });

  server.get('/notify', function (req, res, cb) {
    var bucket = moment().format('YYYYMMDD:HH');
    model.notifyUsersForBucket(bucket, function (err, status) {
      if (err) { return cb(_error(err)); }
      res.send(status);
    });
  });

  server.get('/notify/:bucket?', function (req, res, cb) {
    var bucket = req.params.bucket;
    model.notifyUsersForBucket(bucket, function (err, status) {
      if (err) { return cb(_error(err)); }
      res.send(status);
    });
  });
};
