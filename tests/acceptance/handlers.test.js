/* eslint-env node, mocha */
const expect = require('expect.js');
const async = require('async');
const moment = require('moment');

describe('Handlers and Model', () => {
  const config = require('../../config/config.json');
  const Redis = require('../../db/redis');
  const fixtures = require('../fixtures');
  let feed;
  let redis;
  let model;

  const notifier = (user, notifications) => {
  };

  before((done) => {
    Redis(config, (next, client) => {
      redis = client;
      model = require('../../model')(config, redis, notifier);
      feed = require('../../handlers/feed')(config, redis, notifier);
      done();
    });
  });

  describe('Basic Handlers', () => {
    it('Seguir notify redis client is working', (done) => {
      redis.ping((err, result) => {
        expect(err).to.be(null);
        expect(result).to.be('PONG');
        done();
      });
    });
  });

  describe('Feed - view, add and remove', () => {
    beforeEach(() => {
      redis.flushdb();
    });

    it('can publish a feed-view event and observe the user state being initialised in redis', (done) => {
      const sample = fixtures['feed-view'][0];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getUserStatus(sample.user.user, (err, status) => {
          expect(err).to.be(null);
          expect(status.state.bucket_period).to.be('1');
          done();
        });
      });
    });

    it('can retrieve a user by id', (done) => {
      const sample = fixtures['feed-view'][0];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getUser(sample.user.user, (err, user) => {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          done();
        });
      });
    });

    it('can retrieve a user by altid', (done) => {
      const sample = fixtures['feed-view'][0];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getUserByAltid(sample.user.altid, (err, user) => {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          done();
        });
      });
    });

    it('can retrieve a user by name', (done) => {
      const sample = fixtures['feed-view'][0];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getUserByUsername(sample.user.username, (err, user) => {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          done();
        });
      });
    });

    it('can retrieve a user by name even if they have no userdata', (done) => {
      const sample = fixtures['feed-view'][2];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getUserByUsername(sample.user.username, (err, user) => {
          expect(err).to.be(null);
          expect(user.user).to.be(sample.user.user);
          expect(user.userdata).to.be('{}');
          done();
        });
      });
    });

    it('get a 404 if I try and retrieve a user that doesnt exist by id', (done) => {
      model.getUser('ABCD', (err) => {
        expect(err.statusCode).to.be(404);
        done();
      });
    });

    it('get a 404 if I try and retrieve a user that doesnt exist by altid', (done) => {
      model.getUserByAltid('ABCD', (err) => {
        expect(err.statusCode).to.be(404);
        done();
      });
    });

    it('get a 404 if I try and retrieve a user that doesnt exist by username', (done) => {
      model.getUserByUsername('ABCD', (err) => {
        expect(err.statusCode).to.be(404);
        done();
      });
    });

    it('can publish a feed-add event but if the user hasnt ever viewed their feed it will not notify', (done) => {
      const sample = fixtures['feed-add'][0];
      feed.add(sample, (err) => {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, (err, results) => {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      });
    });

    it('can publish a feed-add event after a feed-view and you will see the notification in their feed', (done) => {
      const sample = fixtures['feed-add'][0];
      const sampleView = fixtures['feed-view'][1];
      feed.view(sampleView, (err) => {
        expect(err).to.be(null);
        feed.add(sample, (err) => {
          expect(err).to.be(null);
          model.getNotificationsForUser(sample.user.user, (err, results) => {
            expect(err).to.be(null);
            expect(results.length).to.be(1);
            done();
          });
        });
      });
    });

    it('can publish multiple feed-add events and observe the data in the right order', (done) => {
      const phteven = fixtures['feed-add'][0].user.user;
      const sampleView = fixtures['feed-view'][1];

      feed.view(sampleView, (err) => {
        expect(err).to.be(null);
        async.map(fixtures['feed-add'], feed.add, (err) => {
          expect(err).to.be(null);
          model.getNotificationsForUser(phteven, (err, results) => {
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

    it('can publish a feed-add event, then a feed-remove and see no notification in redis', (done) => {
      const sample = fixtures['feed-add'][1];
      const removeSample = fixtures['feed-remove'][0];
      const sampleView = fixtures['feed-view'][0];

      feed.view(sampleView, (err) => {
        expect(err).to.be(null);
        feed.add(sample, (err) => {
          expect(err).to.be(null);
          model.getNotificationsForUser(sample.user.user, (err, results) => {
            expect(err).to.be(null);
            expect(results.length).to.be(1);
            expect(results[0].item).to.be(sample.item.item);
            feed.remove(removeSample, (err) => {
              expect(err).to.be(null);
              model.getNotificationsForUser(sample.user.user, (err, results) => {
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

  describe('Basic notifications and feed views', () => {
    before((done) => {
      redis.flushdb(done);
    });

    it('can publish a feed-view event and see no notification data in redis', (done) => {
      const sample = fixtures['feed-view'][1];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, (err, results) => {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      });
    });

    it('can publish a feed-add event and observe the data directly in redis', (done) => {
      const sample = fixtures['feed-add'][0];
      feed.add(sample, (err) => {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, (err, results) => {
          expect(err).to.be(null);
          expect(results[0].item).to.be(sample.item.item);
          done();
        });
      });
    });

    it('can see user status for a user with notifications', (done) => {
      const sample = fixtures['feed-add'][0];
      model.getUserStatus(sample.user.user, (err, status) => {
        expect(err).to.be(null);
        expect(status.notifications).to.be(1);
        done();
      });
    });

    it('can publish a second feed-view event and see no notification data in redis', (done) => {
      const sample = fixtures['feed-view'][1];
      feed.view(sample, (err) => {
        expect(err).to.be(null);
        model.getNotificationsForUser(sample.user.user, (err, results) => {
          expect(err).to.be(null);
          expect(results.length).to.be(0);
          done();
        });
      });
    });

    it('can see user status for a user with previous notifications after a feed view', (done) => {
      const sample = fixtures['feed-view'][1];
      model.getUserStatus(sample.user.user, (err, status) => {
        expect(err).to.be(null);
        expect(status.notifications).to.be(0);
        done();
      });
    });

    it('can see user status for a user with a number of notifications', (done) => {
      const phteven = fixtures['feed-add'][0].user.user;
      async.map(fixtures['feed-add'], feed.add, (err) => {
        expect(err).to.be(null);
        model.getUserStatus(phteven, (err, status) => {
          expect(err).to.be(null);
          expect(status.notifications).to.be(3);
          done();
        });
      });
    });
  });

  describe('Notifications and buckets', () => {
    before((done) => {
      redis.flushdb(() => {
        async.map(fixtures['feed-view'], feed.view, done);
      });
    });

    beforeEach((done) => {
      async.map(fixtures['feed-add'], feed.add, done);
    });

    const bucket1 = moment().add(1, 'day').format('YYYYMMDD:HH');
    const bucket3 = moment().add(3, 'day').format('YYYYMMDD:HH');
    const bucket5 = moment().add(5, 'day').format('YYYYMMDD:HH');

    it('can see users who should be notified in a given bucket', (done) => {
      model.getUsersForBucket(bucket1, (err, users) => {
        expect(err).to.be(null);
        expect(users.length).to.be(3);
        done();
      });
    });

    it('get an empty array if I try and retrieve a bucket that doesnt exist', (done) => {
      model.getUsersForBucket('BOB', (err, users) => {
        expect(err).to.be(null);
        expect(users.length).to.be(0);
        done();
      });
    });

    it('after notifying users in a given bucket, they move out to the next one', (done) => {
      model.notifyUsersForBucket(bucket1, (err) => {
        expect(err).to.be(null);
        model.getUsersForBucket(bucket1, (err, users) => {
          expect(err).to.be(null);
          expect(users.length).to.be(0);
          model.getUsersForBucket(bucket3, (err, users) => {
            expect(err).to.be(null);
            expect(users.length).to.be(3);
            done();
          });
        });
      });
    });

    it('can retrieve a list of users who have pending notifications', (done) => {
      model.getUsers((err, users) => {
        expect(err).to.be(null);
        expect(users.length).to.be(2);
        done();
      });
    });

    it('after notifying users again in a given bucket, they move out to the next one', (done) => {
      model.notifyUsersForBucket(bucket3, (err) => {
        expect(err).to.be(null);
        model.getUsersForBucket(bucket3, (err, users) => {
          expect(err).to.be(null);
          expect(users.length).to.be(0);
          model.getUsersForBucket(bucket5, (err, users) => {
            expect(err).to.be(null);
            expect(users.length).to.be(3);
            done();
          });
        });
      });
    });

    it('after notifying users again in the final bucket, they then become inert', (done) => {
      const phteven = fixtures['feed-add'][0].user.user;
      model.notifyUsersForBucket(bucket5, (err) => {
        expect(err).to.be(null);
        model.getUsersForBucket(bucket5, (err, users) => {
          expect(err).to.be(null);
          expect(users.length).to.be(0);
          model.getUserStatus(phteven, (err, status) => {
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
