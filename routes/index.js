const restify = require('restify');
const moment = require('moment');

module.exports = (server, api, config, redis, notifier, logger) => {
  const model = require('../model')(config, redis, notifier, logger);

  const _error = (err) => new restify.HttpError(err);

  server.get('/', (req, res, cb) => {
    res.send({status: 'Seguir Notify'});
    cb();
  });

  server.get('/user/:user', (req, res, cb) => {
    model.getUserStatus(req.params.user, (err, status) => {
      if (err) { return cb(_error(err)); }
      if (!status) { return cb(_error({statusCode: 404, message: 'User with id \'' + req.params.user + '\' not found'})); }
      res.send(status);
    });
  });

  server.get('/useraltid/:altid', (req, res, cb) => {
    model.getUserByAltid(req.params.altid, (err, user) => {
      if (err) { return cb(_error(err)); }
      if (!user) { return cb(_error({statusCode: 404, message: 'User with altId \'' + req.params.altid + '\' not found'})); }
      model.getUserStatus(user.user, (err, status) => {
        if (err) { return cb(_error(err)); }
        res.send(status);
      });
    });
  });

  server.get('/username/:username', (req, res, cb) => {
    model.getUserByUsername(req.params.username, (err, user) => {
      if (err) { return cb(_error(err)); }
      if (!user) { return cb(_error({statusCode: 404, message: 'User with username \'' + req.params.username + '\' not found'})); }
      model.getUserStatus(user.user, (err, status) => {
        if (err) { return cb(_error(err)); }
        res.send(status);
      });
    });
  });

  server.get('/notify', (req, res, cb) => {
    const bucket = moment().format('YYYYMMDD:HH');
    model.notifyUsersForBucket(bucket, (err, status) => {
      if (err) { return cb(_error(err)); }
      res.send(status);
    });
  });

  server.get('/notify/:bucket?', (req, res, cb) => {
    const bucket = req.params.bucket;
    model.notifyUsersForBucket(bucket, (err, status) => {
      if (err) { return cb(_error(err)); }
      res.send(status);
    });
  });
};
