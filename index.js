const restify = require('restify');
const debug = require('debug')('seguir:notify');

const bootstrapServer = (api, config, notifier, logger, next) => {
  const server = restify.createServer({
    name: 'seguir-notify',
    version: '0.1.0',
    log: api.logger
  });

  // Default middleware
  server.use(restify.bodyParser({mapParams: true}));
  server.use(restify.queryParser({mapParams: false}));
  server.use(restify.gzipResponse());
  server.use(restify.CORS());
  server.use((req, res, cb) => {
    debug(req.url, req.params, req.headers);
    cb();
  });

  server.get('/status', (req, res, cb) => {
    res.send({status: 'OK'});
    cb();
  });

  // Preflight
  server.pre(restify.pre.sanitizePath());
  server.pre(restify.pre.userAgentConnection());

  const redis = require('./db/redis');
  redis(config, (err, client) => {
    if (err) { return next(err); }
    server.model = require('./model')(config, client, notifier, logger);
    require('./routes')(server, api, config, client, notifier, logger);
    require('./handlers')(api, config, client, notifier, logger);
    next(null, server);
  });
};

/* istanbul ignore if */
if (require.main === module) {
  const config = require('./config/config.json');
  const notifier = (user, notifications) => {
    console.log('Notify [' + user.username + ']: ' + notifications && notifications.length);
  };
  const logger = message => {
    console.log('Logger : ' + message);
  };
  require('seguir')(config, (err, api) => {
    if (err) { return process.exit(0); }
    bootstrapServer(api, config, notifier, logger, (err, server) => {
      if (err) {
        console.log('Unable to bootstrap server: ' + err.message);
        return;
      }
      server.listen(config.port || 3000, () => {
        console.log('Server %s listening at %s', server.name, server.url);
      });
    });
  });
} else {
  module.exports = (config, notifier, logger, statsd, next) => {
    if (!next) { next = statsd; statsd = undefined; }
    if (!next) { next = logger; logger = undefined; }

    require('seguir')(config, logger, statsd, (err, api) => {
      if (err) {
        return next(new Error('Unable to bootstrap API: ' + err.message));
      }
      return bootstrapServer(api, config, notifier, logger, next);
    });
  };
}
