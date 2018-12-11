var restify = require('restify');
var debug = require('debug')('seguir:notify');

function bootstrapServer (api, config, notifier, logger, next) {
  var server = restify.createServer({
    name: 'seguir-notify',
    version: '0.1.0',
    log: api.logger
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

  server.get('/status', function (req, res, cb) {
    res.send({status: 'OK'});
    cb();
  });

  // Preflight
  server.pre(restify.pre.sanitizePath());
  server.pre(restify.pre.userAgentConnection());

  var redis = require('./db/redis');
  redis(config, function (err, client) {
    if (err) { return next(err); }
    server.model = require('./model')(config, client);
    require('./routes')(server, api, config, client, notifier, logger);
    require('./handlers')(api, config, client);
    next(null, server);
  });
}

/* istanbul ignore if */
if (require.main === module) {
  var config = require('./config/config.json');
  var notifier = function (user, notifications) {
    console.log('Notify [' + user.username + ']: ' + notifications && notifications.length);
  };
  var logger = function (message) {
    console.log('Logger : ' + message);
  };
  require('seguir')(config, function (err, api) {
    if (err) { return process.exit(0); }
    bootstrapServer(api, config, notifier, logger, function (err, server) {
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
  module.exports = function (config, notifier, logger, statsd, next) {
    if (!next) { next = statsd; statsd = undefined; }
    if (!next) { next = logger; logger = undefined; }

    require('seguir')(config, logger, statsd, function (err, api) {
      if (err) {
        return next(new Error('Unable to bootstrap API: ' + err.message));
      }
      return bootstrapServer(api, config, notifier, logger, next);
    });
  };
}
