/*eslint-env node, mocha */
var expect = require('expect.js');
var async = require('async');
var TIMEOUT = 200;

describe('Handlers and Model', function () {

  var config = require('../../config')();
  var fixtures = require('../fixtures');
  var model = require('../../model')(config);
  var redis = model._redis;
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

    it('Seguir messaging redis client is working', function (done) {

      api.messaging.client.ping(function (err, result) {
        expect(err).to.be(null);
        expect(result).to.be('PONG');
        done();
      });

    });

    it('Seguir notify redis client is working', function (done) {

      redis.ping(function (err, result) {
        expect(err).to.be(null);
        expect(result).to.be('PONG');
        done();
      });

    });

  });

  describe('Feed - additions and removals', function () {

    beforeEach(function (done) {
      api.messaging.client.flushdb(done);
    });

    it('can publish a feed-add event and observe the data directly in redis', function (done) {

      var sample = fixtures['feed-add'][0];
      api.messaging.publish('feed-add', sample);

      setTimeout(function () {
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(1);
          expect(results[0].item).to.be(sample.item.item);
          done();
        });
      }, TIMEOUT);

    });

    it('can publish multiple feed-add events and observe the data in the right order', function (done) {

      var phteven = fixtures['feed-add'][0].user.user;

      async.map(fixtures['feed-add'], function (item, cb) {
        api.messaging.publish('feed-add', item);
        setTimeout(cb, 5);
      }, function (err) {
        expect(err).to.be(null);
        setTimeout(function () {
          model.getNotificationsForUser(phteven, function (err, results) {
            expect(err).to.be(null);
            expect(results.length).to.be(3);
            expect(results[0].item).to.be(fixtures['feed-add'][0].item.item);
            expect(results[1].item).to.be(fixtures['feed-add'][2].item.item);
            expect(results[2].item).to.be(fixtures['feed-add'][3].item.item);
            done();
          });
        }, TIMEOUT);

      });

    });

    it('can publish a feed-add event, then a feed-remove and see no notification in redis', function (done) {

      var sample = fixtures['feed-add'][1];
      var removeSample = fixtures['feed-remove'][0];

      api.messaging.publish('feed-add', sample);

      setTimeout(function () {
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(1);
          expect(results[0].item).to.be(sample.item.item);

          api.messaging.publish('feed-remove', removeSample);

          setTimeout(function () {
            model.getNotificationsForUser(sample.user.user, function (err, results) {
              expect(err).to.be(null);
              expect(results.length).to.be(0);
              done();
            });
          }, TIMEOUT);

        });
      }, TIMEOUT);

    });

  });

  describe('Feed - user state - views clear out any notifications', function () {

    before(function (done) {
      api.messaging.client.flushdb(done);
    });

    it('can publish a feed-view event and see no notification data in redis', function (done) {

      var sample = fixtures['feed-view'][0];
      api.messaging.publish('feed-view', sample);

      setTimeout(function () {
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      }, TIMEOUT);

    });

    it('can publish a feed-add event and observe the data directly in redis', function (done) {

      var sample = fixtures['feed-add'][0];
      api.messaging.publish('feed-add', sample);

      setTimeout(function () {
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results[0].item).to.be(sample.item.item);
          done();
        });
      }, TIMEOUT);

    });

    it('can publish a second feed-view event and see no notification data in redis', function (done) {

      var sample = fixtures['feed-view'][0];
      api.messaging.publish('feed-view', sample);

      setTimeout(function () {
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      }, TIMEOUT);

    });

  });

});
