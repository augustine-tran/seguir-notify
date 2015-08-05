/*eslint-env node, mocha */
var expect = require('expect.js');
var async = require('async');
var moment = require('moment');

describe('Handlers and Model', function () {

  var config = require('../../config')();
  var Redis = require('../../db/redis');
  var fixtures = require('../fixtures');
  var feed;
  var redis;
  var model;

  this.timeout(5000);

  before(function (done) {
    Redis(config, function (next, client) {
      redis = client;
      model = require('../../model')(config, redis);
      feed = require('../../handlers/feed')(config, redis);
      done();
    });
  });

  describe('Basic Handlers', function () {

    it('Seguir notify redis client is working', function (done) {

      redis.ping(function (err, result) {
        expect(err).to.be(null);
        expect(result).to.be('PONG');
        done();
      });

    });

  });

  describe('Feed - additions and removals', function () {

    beforeEach(function () {
      redis.flushdb();
    });

    it('can publish a feed-add event and observe the data directly in redis', function (done) {

      var sample = fixtures['feed-add'][0];
      feed.add(sample, function (err, results) {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(1);
          expect(results[0].item).to.be(sample.item.item);
          done();
        });
      });

    });

    it('can publish multiple feed-add events and observe the data in the right order', function (done) {

      var phteven = fixtures['feed-add'][0].user.user;

      async.map(fixtures['feed-add'], feed.add, function (err) {
        expect(err).to.be(null);
        model.getNotificationsForUser(phteven, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(3);
          expect(results[0].item).to.be(fixtures['feed-add'][0].item.item);
          expect(results[1].item).to.be(fixtures['feed-add'][2].item.item);
          expect(results[2].item).to.be(fixtures['feed-add'][3].item.item);
          done();
        });
      });

    });

    it('can publish a feed-add event, then a feed-remove and see no notification in redis', function (done) {

      var sample = fixtures['feed-add'][1];
      var removeSample = fixtures['feed-remove'][0];

      feed.add(sample, function (err) {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(1);
          expect(results[0].item).to.be(sample.item.item);
          feed.remove(removeSample, function (err) {
            expect(err).to.be(null);
            model.getNotificationsForUser(sample.user.user, function (err, results) {
              expect(err).to.be(null);
              expect(results.length).to.be(0);
              done();
            });
          });
        });
      });

    });

  });

  describe('Basic notifications and feed views', function () {

    before(function (done) {
      redis.flushdb(done);
    });

    it('can publish a feed-view event and see no notification data in redis', function (done) {

      var sample = fixtures['feed-view'][0];
      feed.view(sample, function (err) {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      });

    });

    it('can publish a feed-add event and observe the data directly in redis', function (done) {

      var sample = fixtures['feed-add'][0];
      feed.add(sample, function (err) {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results[0].item).to.be(sample.item.item);
          done();
        });
      });

    });

    it('can see user status for a user with notifications', function (done) {

      var sample = fixtures['feed-add'][0];
      model.getUserStatus(sample.user.user, function (err, status) {
        expect(err).to.be(null);
        expect(status.notifications).to.be(1);
        done();
      });

    });

    it('can publish a second feed-view event and see no notification data in redis', function (done) {
      var sample = fixtures['feed-view'][1];
      feed.view(sample, function (err) {
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      });
    });

    it('can see user status for a user with previous notifications after a feed view', function (done) {
      var sample = fixtures['feed-view'][1];
      model.getUserStatus(sample.user.user, function (err, status) {
        expect(err).to.be(null);
        expect(status.notifications).to.be(0);
        done();
      });
    });

    it('can see user status for a user with a number of notifications', function (done) {

      var phteven = fixtures['feed-add'][0].user.user;
      async.map(fixtures['feed-add'], feed.add, function (err) {
        expect(err).to.be(null);
        model.getUserStatus(phteven, function (err, status) {
          expect(err).to.be(null);
          expect(status.notifications).to.be(3);
          done();
        });
      });

    });

  });

  describe('Notifications and buckets', function () {

    before(function (done) {
      redis.flushdb(function () {
        async.map(fixtures['feed-view'], feed.view, done);
      });
    });

    beforeEach(function (done) {
      async.map(fixtures['feed-add'], feed.add, done);
    });

    var bucket1 = moment().add(1, 'day').format('YYYYMMDD:HH');
    var bucket3 = moment().add(3, 'day').format('YYYYMMDD:HH');
    var bucket5 = moment().add(5, 'day').format('YYYYMMDD:HH');

    it('can see users who should be notified in a given bucket', function (done) {
      model.getUsersForBucket(bucket1, function (err, users) {
        expect(err).to.be(null);
        expect(users.length).to.be(2);
        done();
      });
    });

    it('after notifying users in a given bucket, they move out to the next one', function (done) {

      model.notifyUsersForBucket(bucket1, function (err) {
        expect(err).to.be(null);
        model.getUsersForBucket(bucket1, function (err, users) {
          expect(err).to.be(null);
          expect(users.length).to.be(0);
          model.getUsersForBucket(bucket3, function (err, users) {
            expect(err).to.be(null);
            expect(users.length).to.be(2);
            done();
          });
        });
      });

    });

    it('after notifying users again in a given bucket, they move out to the next one', function (done) {

      model.notifyUsersForBucket(bucket3, function (err) {
        expect(err).to.be(null);
        model.getUsersForBucket(bucket3, function (err, users) {
          expect(err).to.be(null);
          expect(users.length).to.be(0);
          model.getUsersForBucket(bucket5, function (err, users) {
            expect(err).to.be(null);
            expect(users.length).to.be(2);
            done();
          });
        });
      });

    });

    it('after notifying users again in the final bucket, they then become inert', function (done) {

      var phteven = fixtures['feed-add'][0].user.user;
      model.notifyUsersForBucket(bucket5, function (err) {
        expect(err).to.be(null);
        model.getUsersForBucket(bucket5, function (err, users) {
          expect(err).to.be(null);
          expect(users.length).to.be(0);
          model.getUserStatus(phteven, function (err, status) {
            expect(err).to.be(null);
            expect(status.notifications).to.be(0);
            expect(status.state.bucket_period).to.be('_PAUSED_');
            done();
          });
        });
      });

    });

  });

});
