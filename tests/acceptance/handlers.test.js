/*eslint-env node, mocha */
var expect = require('expect.js');

describe('Handlers', function () {

  var config = require('../../config')();
  var api;

  this.timeout(5000);

  before(function (done) {
    require('seguir')(config, function (err, seguirApi) {
      expect(err).to.be(null);
      api = seguirApi;
      require('../../handlers')(api, config);
      done();
    });
  });

  describe('Basic Handlers', function () {

    it('redis client is working', function (done) {

      api.messaging.client.ping(function (err, result) {
        expect(err).to.be(null);
        expect(result).to.be('PONG');
        done();
      });

    });

  });

});
