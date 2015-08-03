var restify = require('restify');

module.exports = function (server, api, config) {

  var redis = require('../db/redis')(config);

  function _error (err) {
    return new restify.HttpError(err);
  }

  server.get('/', function (req, res, cb) {
    res.send({status: 'Seguir Notify'});
    cb();
  });

  server.get('/user/:username', function (req, res, cb) {
    var usernameKey = ['username', req.params.username].join(':');
    redis.get(usernameKey, function (err, user) {
      if (err) { return _error(err); }
      res.send({user: user});
    });
  });

};
