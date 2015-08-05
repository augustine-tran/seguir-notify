var restify = require('restify');
var bunyan = require('bunyan');
var _ = require('lodash');
var debug = require('debug')('seguir:notify');

var defaultLogger = bunyan.createLogger({
  name: 'seguir-notify',
  serializers: restify.bunyan.serializers
});

function bootstrapServer (api, config, notifier, next) {

  var server = restify.createServer({
    name: 'seguir-notify',
    version: '0.1.0',
    log: config.logger || defaultLogger
  });

  // Default middleware
  server.use(restify.bodyParser({mapParams: true}));
  server.use(restify.queryParser({mapParams: false}));
  server.use(restify.gzipResponse());
  server.use(restify.CORS());
  server.use(function (req, res, cb) {
    debug(req.url, req.params, req.headers);
    cb();
  });

  // Logging
  server.on('after', function (request, response, route, error) {
    var fn = error ? 'error' : 'info';
    if (api.config.logging) {
      request.log[fn]({req: request, res: response, route: route, err: error}, 'request');
    }
  });

  server.get('/status', function (req, res, cb) {
    api.auth.getAccounts(function (err, accounts) {
      if (err) { return _error(err); }
      var statusConfig = _.clone(config);
      delete statusConfig.logger;
      res.send({status: 'OK', config: statusConfig, accounts: accounts});
      cb();
    });
  });

  // Preflight
  server.pre(restify.pre.sanitizePath());
  server.pre(restify.pre.userAgentConnection());

  function _error (err) {
    return new restify.HttpError(err);
  }

  var redis = require('./db/redis');
  redis(config, function (err, client) {
    if (err) { return next(err); }
    require('./routes')(server, api, config, client, notifier);
    require('./handlers')(api, config, client);
    next(null, server);
  });

}

/* istanbul ignore if */
if (require.main === module) {

  var config = require('./config')();
  var notifier = function () {};
  require('seguir')(config, function (err, api) {
    if (err) { return process.exit(0); }
    bootstrapServer(api, config, notifier, function (err, server) {
      if (err) {
        console.log('Unable to bootstrap server: ' + err.message);
        return;
      }
      server.listen(config.port || 3000, function () {
        console.log('Server %s listening at %s', server.name, server.url);
      });
    });
  });

} else {
  module.exports = function (config, notifier, next) {
    require('seguir')(config, function (err, api) {
      if (err) {
        return next(new Error('Unable to bootstrap API: ' + err.message));
      }
      return bootstrapServer(api, config, notifier, next);
    });
  };
}
