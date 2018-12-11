/* eslint-env node, mocha */
var expect = require('expect.js');
var async = require('async');
var moment = require('moment');

describe('Handlers and Model', function () {
  var config = require('../../config/config.json');
  var Redis = require('../../db/redis');
  var fixtures = require('../fixtures');
  var feed;
  var redis;
  var model;

  this.timeout(5000);

  var notifier = function (user, notifications) {
  };

  var logger = {
    log: function (message) {}
  };

  before(function (done) {
    Redis(config, function (next, client) {
      redis = client;
      model = require('../../model')(config, redis, notifier, logger);
      feed = require('../../handlers/feed')(config, redis, notifier, logger);
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

  describe('Feed - view, add and remove', function () {
    beforeEach(function () {
      redis.flushdb();
    });

    it('can publish a feed-view event and observe the user state being initialised in redis', function (done) {
      var sample = fixtures['feed-view'][0];
      feed.view(sample, function (err, results) {
        expect(err).to.be(null);
        model.getUserStatus(sample.user.user, function (err, status) {
          expect(err).to.be(null);
          expect(status.state.bucket_period).to.be('1');
          done();
        });
      });
    });

    it('can retrieve a user by id', function (done) {
      var sample = fixtures['feed-view'][0];
      feed.view(sample, function (err, results) {
        expect(err).to.be(null);
        model.getUser(sample.user.user, function (err, user) {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          done();
        });
      });
    });

    it('can retrieve a user by altid', function (done) {
      var sample = fixtures['feed-view'][0];
      feed.view(sample, function (err, results) {
        expect(err).to.be(null);
        model.getUserByAltid(sample.user.altid, function (err, user) {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          done();
        });
      });
    });

    it('can retrieve a user by name', function (done) {
      var sample = fixtures['feed-view'][0];
      feed.view(sample, function (err, results) {
        expect(err).to.be(null);
        model.getUserByUsername(sample.user.username, function (err, user) {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          done();
        });
      });
    });

    it('can retrieve a user by name even if they have no userdata', function (done) {
      var sample = fixtures['feed-view'][2];
      feed.view(sample, function (err, results) {
        expect(err).to.be(null);
        model.getUserByUsername(sample.user.username, function (err, user) {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          expect(user.userdata).to.be('{}');
          done();
        });
      });
    });

    it('get a 404 if I try and retrieve a user that doesnt exist by id', function (done) {
      model.getUser('ABCD', function (err, user) {
        expect(err.statusCode).to.be(404);
        done();
      });
    });

    it('get a 404 if I try and retrieve a user that doesnt exist by altid', function (done) {
      model.getUserByAltid('ABCD', function (err, user) {
        expect(err.statusCode).to.be(404);
        done();
      });
    });

    it('get a 404 if I try and retrieve a user that doesnt exist by username', function (done) {
      model.getUserByUsername('ABCD', function (err, user) {
        expect(err.statusCode).to.be(404);
        done();
      });
    });

    it('can publish a feed-add event but if the user hasnt ever viewed their feed it will not notify', function (done) {
      var sample = fixtures['feed-add'][0];
      feed.add(sample, function (err, results) {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, function (err, results) {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      });
    });

    it('can publish a feed-add event after a feed-view and you will see the notification in their feed', function (done) {
      var sample = fixtures['feed-add'][0];
      var sampleView = fixtures['feed-view'][1];
      feed.view(sampleView, function (err, results) {
        expect(err).to.be(null);
        feed.add(sample, function (err, results) {
          expect(err).to.be(null);
          model.getNotificationsForUser(sample.user.user, function (err, results) {
            expect(err).to.be(null);
            expect(results.length).to.be(1);
            done();
          });
        });
      });
    });

    it('can publish multiple feed-add events and observe the data in the right order', function (done) {
      var phteven = fixtures['feed-add'][0].user.user;
      var sampleView = fixtures['feed-view'][1];

      feed.view(sampleView, function (err, results) {
        expect(err).to.be(null);
        async.map(fixtures['feed-add'], feed.add, function (err) {
          expect(err).to.be(null);
          model.getNotificationsForUser(phteven, function (err, results) {
            expect(err).to.be(null);
            expect(results.length).to.be(3);
            expect(results[2].item).to.be(fixtures['feed-add'][0].item.item);
            expect(results[1].item).to.be(fixtures['feed-add'][2].item.item);
            expect(results[0].item).to.be(fixtures['feed-add'][3].item.item);
            done();
          });
        });
      });
    });

    it('can publish a feed-add event, then a feed-remove and see no notification in redis', function (done) {
      var sample = fixtures['feed-add'][1];
      var removeSample = fixtures['feed-remove'][0];
      var sampleView = fixtures['feed-view'][0];

      feed.view(sampleView, function (err, results) {
        expect(err).to.be(null);
        feed.add(sample, function (err, result) {
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
  });

  describe('Basic notifications and feed views', function () {
    before(function (done) {
      redis.flushdb(done);
    });

    it('can publish a feed-view event and see no notification data in redis', function (done) {
      var sample = fixtures['feed-view'][1];
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
        expect(err).to.be(null);
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
        expect(users.length).to.be(3);
        done();
      });
    });

    it('get an empty array if I try and retrieve a bucket that doesnt exist', function (done) {
      model.getUsersForBucket('BOB', function (err, users) {
        expect(err).to.be(null);
        expect(users.length).to.be(0);
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
            expect(users.length).to.be(3);
            done();
          });
        });
      });
    });

    it('can retrieve a list of users who have pending notifications', function (done) {
      model.getUsers(function (err, users) {
        expect(err).to.be(null);
        expect(users.length).to.be(2);
        done();
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
            expect(users.length).to.be(3);
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
