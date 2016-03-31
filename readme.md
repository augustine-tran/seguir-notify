# Seguir Notify - Notification component for Seguir

[![Build Status](https://travis-ci.org/tes/seguir-notify.svg)](https://travis-ci.org/tes/seguir-notify) [![bitHound Score](https://www.bithound.io/github/tes/seguir-notify/badges/score.svg)](https://www.bithound.io/github/tes/seguir-notify)

[http://tes.github.io/seguir/server](http://tes.github.io/seguir)

## How it works

This module receives published events via feed actions from seguir:

```
feed-add
feed-remove
feed-view
```

These three events all work to maintain a view of notification state for each seguir user.

## How it works

Picture 4 buckets (these are configurable), that are keyed by periods of 1 day, 3 days and 5 days from now.  When you first view your feed (and send a feed-view), you are placed in bucket 1.

```
VIEW ->  *
       +   +    +   +    +   +    +   +
       | 1 |    | 3 |    | 5 |    | P |
       +---+    +---+    +---+    +---+
```

You then leave the site (boo), and go and do something else on the internets.  While you are away, any items added to your feed build up in your notification queue.

24 hours later, a job that fires each hour catches up and calls a function to notify all users in the first bucket.

```
       +   +    +   +    +   +    +   +
       | 1 |    | 3 |    | 5 |    | P |
       +---+    +---+    +---+    +---+
         ^
  NOTIFY +

```

This triggers a callback to your service (per user), so that you can choose to notify them however you like - e.g. drop a message out to a worker queue to send an email.

```js
notifier (user, notifications) => { }
```

This clears out all pending notifications in your queue, and in addition it moves everyone in the bucket out to the next one - e.g. it will notify them again in 2 days instead of 1.

```
    move * -----> *
       +   +    +   +    +   +    +   +
       | 1 |    | 3 |    | 5 |    | P |
       +---+    +---+    +---+    +---+
```

Now, here is where you hope that you receive your notification, and click on it to come back and visit the site.  If you do this, then you are moved back into a new 'bucket one' (which is a bucket 1 day from when you view your feed).


```
VIEW ->  *
       +   +    +   +    +   +    +   +
       | 1 |    | 3 |    | 5 |    | P |
       +---+    +---+    +---+    +---+
```

However, if you don't click on your link, then in 2 days the notify process will fire again for that bucket:

```
       +   +    +   +    +   +    +   +
       | 1 |    | 3 |    | 5 |    | P |
       +---+    +---+    +---+    +---+
                  ^
           NOTIFY +

```

And the process repeats, all the way until you are moved out to the far right - which is where your notifications are paused.

When in the PAUSED state, your notifications will not build up until you visit the home page again (this is to avoid spamming users and filling up the notification queue infinitely for inactive users).

# End Points

### /user/:user

View current details and state for a user by seguir ID.

[http://localhost:4001/user/62bfd6c1-3f7a-43a4-afc3-ed12adf17d11](http://localhost:4001/user/62bfd6c1-3f7a-43a4-afc3-ed12adf17d11)

### /username/:username

View current details and state for a user by username.

[http://localhost:4001/username/cliftonc](http://localhost:4001/username/cliftonc)

### /useraltid/:useraltid

View current details and state for a user by altid.

[http://localhost:4001/useraltid/123](http://localhost:4001/user/123)

### /notify

Trigger a notification for the current hour.

[http://localhost:4001/notify](http://localhost:4001/notify)

### /notify/20150815:13

Trigger a notification for a specific bucket.

[http://localhost:4001/notify/20150815:13](http://localhost:4001/notify/20150815:13)

## Connecting Up The Notifier

In your service, all you need to do is pass in a callback when configuring seguir-notify:

```js
let notifier = (user, notifications) => {
  // THIS IS WHERE YOU WOULD ACTUALLY DO SOMETHING USEFUL
  logger.info(user.user + ': ' + notifications.length);
};
seguirNotify(config, notifier, (err, server) => {
  if (err) { return next(err); }
  server.listen(config.server.port, () => {
    logger.info('Server %s listening at %s', server.name, server.url);
    next();
  });
});
```

## Adding additional routes

You may want to wire up additional routes - e.g. one that reads your own user cookie / auth and interacts with the data.

```js
seguirNotify(config, notifier, (err, server) => {
  if (err) { return next(err); }

  // Custom routes - assume 'authMiddleware' is auth middleware that populates req.user
  server.get('/status', authMiddleware, function (req, res, cb) {
    model.getUserByAltid(req.user.id, function (err, user) {
      server.model.getUserStatus(user.user, function (err, status) {
        res.send(status);
        cb();
      });
    });
  });

  server.listen(config.server.port, () => {
    logger.info('Server %s listening at %s', server.name, server.url);
    next();
  });

});
```

# Redis Model

## View State

This is information that explains when a user last accessed their feed.  This is quite blunt, so literally any access of a feed will reset this state at this point.  The guid example below is a user guid from Seguir.

```
user:62bfd6c1-3f7a-43a4-afc3-ed12adf17d11
```

```json
{
  "user": "088ae1a9-9c12-491b-8a54-e2d750651cbf",
  "username": "profiles_smoke_test",
  "altid": "4912851",
  "userdata": {
      "displayName": "profiles_smoke_test"
  }
}
```

```
user:state:62bfd6c1-3f7a-43a4-afc3-ed12adf17d11
```

```json
{
    "last_view": "2015-08-07T04:33:51+00:00",
    "first_view": "2015-08-06T16:06:35+00:00",
    "bucket_period_index": "0",
    "previous_view": "2015-08-07T02:33:49+00:00",
    "bucket_period": "1",
    "bucket_key": "notify:bucket:20150808:04"
}
```

## Notify Queue

This is a set of items that the user has missed since last viewing their feed.  This set is cleared when the user views their feed.

```
notify:62bfd6c1-3f7a-43a4-afc3-ed12adf17d11 <key>
```

The ids contained within the set are the hashes of item keys that they need to be notified about.

## Item Data

```
item:9930e95-c77f-4721-bfb8-91cf2081d88f
```

This is a copy of the item from seguir.

# Developing

Simply git clone this repository, ensure you have redis running locally.

To avoid having to load all of seguir, you can load some sample data via the script:

```
node scripts/sample
```

The server runs by default on http://localhost:4001/

```
node .
```
