# Updating T3 Code

This fork is not published as a package and has no release channel. The app you
use and the server running your agents are built from this repository, so
updating means pulling the source, rebuilding, and restarting what you run.

The client and the server can be on different machines. When one is behind the
other, an update notice appears in the conversation and **Settings →
Connections**. Update the machine named in that notice.

## Before you update

Server updates restart the connection and can interrupt active agents and
terminal commands. Saved threads, settings, and project files remain.

**Settings → General → Continue threads after restarts** is off by default.
Enable it to resume supported active threads after an update, crash, or machine
restart. Changes are saved to connected environments that support this setting.
If a supported environment was offline or has a different value, use **Apply to
all** in Settings after it connects.
T3 Code must start again on that machine;
the setting does not enable automatic startup. Terminal commands may still be
interrupted, and threads without saved provider resume state need a new message.
If you previously enabled continuation for updates, enable this setting once
to allow recovery without a connected client.

Rebuilding keeps conversation transcripts, but it cannot carry
every kind of runtime history forward across orchestration changes. Read
[Threads from older T3 Code versions](./thread-migration.md)
before continuing an important older thread.

## Update a server

In the checkout the server runs from:

```sh
git pull
vp i
vp run build
```

Then start the new build:

| How the server runs   | What to do                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Background service    | Run `node apps/server/dist/bin.mjs service install`. It rewrites the service to this checkout and restarts it. |
| Terminal server       | Stop it, then run `vp run --filter t3 start` (or `node apps/server/dist/bin.mjs serve`) again.                 |
| Desktop-hosted server | The desktop app bundles its own server. Update the checkout, rebuild the desktop app, and relaunch it.         |

There is no remote update action for a background service and no `service update`
command, because there is no published package to install. A driver that keeps
running an older checkout keeps serving older code until you reinstall from the
checkout you want.

The **Copy update command** action in an update notice still works: it names the
command line for a foreground server, and you can replace its `npx t3` invocation
with the built or source CLI path from your checkout.

## Update a desktop or mobile client

Build the desktop app from the same checkout with
`vp run dist:desktop:dmg`, `vp run dist:desktop:linux`, or
`vp run dist:desktop:win`; local artifacts are unsigned. See
[Development](../operations/development.md) for prerequisites.

Mobile apps are distributed through the App Store and Google Play and update
there. The mobile app can also download updates in the background and apply them
when you next leave the app. It saves drafts and queued messages before
restarting. If you keep the app open for a long time, it may ask to install
immediately; choosing **Later** leaves the update queued for the next suitable
moment.

## If an update fails

Keep the client open until it reconnects or reports a failure. If the rebuilt
server does not come back:

1. Check the server log at the path printed by `t3 service status`.
2. Run `git status` and `git log` in the checkout; a failed build or a moved
   checkout is the usual cause.
3. Reinstall the service from a known-good checkout, or start that checkout's CLI
   in a terminal to confirm it runs before reinstalling the service.
