var restify = require('restify');

module.exports = function (server, api, config) {

  var model = require('../model')(config);

  function _error (err) {
    return new restify.HttpError(err);
  }

  server.get('/', function (req, res, cb) {
    res.send({status: 'Seguir Notify'});
    cb();
  });

  server.get('/user/:username', function (req, res, cb) {
    model.getUserByUsername(req.params.username, function (err, user) {
      if (err) { return _error(err); }
      user.userdata = JSON.parse(user.userdata);
      res.send(user);
    });
  });

};
