# Seguir Notify - Notification component for Seguir

[http://cliftonc.github.io/seguir/server](http://cliftonc.github.io/seguir)

## How it works

This module receives published events via feed actions from seguir:

```
feed-add
feed-remove
feed-view
```

These three events all work to maintain a view of notification state for each seguir user.

## View State

This is information that explains when a user last accessed their feed.  This is quite blunt, so literally any access of a feed will reset this state at this point.  The guid example below is a user guid from Seguir.

```
user:62bfd6c1-3f7a-43a4-afc3-ed12adf17d11
- timestamp
- json
```

## Notify State

This is a set of items that the user has missed since last viewing their feed.  This set is cleared when the user views their feed, it is also cleared after a configurable time period - e.g. if there is no action and / or we don't send a notification to the user within a time period to avoid memory leaks.

```
notify:62bfd6c1-3f7a-43a4-afc3-ed12adf17d11 <key>
```

The ids contained within the set are the hashes of item keys that they need to be notified about.

## Item State

```
item:9930e95-c77f-4721-bfb8-91cf2081d88f
- <item keys>
```
