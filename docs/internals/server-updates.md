# Server updates and the service launcher

This fork has no release channel, so a server never replaces itself. The
[launcher](../../apps/server/src/serviceLauncher.ts) is written by `t3 service
install` from the checkout that ran it and starts the entry recorded in service
state (`<T3 home>/runtime/service-state.json`): the built or source CLI of that
checkout. It never downloads a package, never swaps runtimes, and owns no
rollback. When the child dies, the launcher exits and systemd's or launchd's
restart policy applies; installing again from another checkout is the only way to
move the service.

## Launch protocol

- The launcher injects `T3_SERVICE_LAUNCHER_CONTEXT` (launcher protocol plus the
  recorded child version). The server refuses to start when it cannot decode that
  context, when the launcher started a different version, or when a context
  exists without the launcher's IPC channel. A foreground server has no context
  and is unmanaged, which is what keeps a terminal run from claiming service
  mode.
- `t3 service status` calls the install current only when the rendered unit, the
  installed launcher, the recorded entry, and the recorded version all match the
  CLI asking. A moved or deleted entry makes the service not current, and
  `t3 service install` is the repair.
- Install stops the running service before rewriting the launcher, state, and
  unit, then starts it again, so a partial rewrite cannot leave a unit pointing at
  an entry that is gone. A failed rewrite restarts the previous service.
- The launcher writes `<T3 home>/runtime/.service-stopping` synchronously when it
  receives SIGTERM or SIGINT, before it signals the child, so a child can tell an
  explicit stop from a crash. `KillMode=mixed` and launchd's single-process
  signal behavior both deliver that signal to the launcher first.

## Platform prerequisites

Linux prerequisites (a reachable systemd user manager, lingering enabled) are
checked before any file is written, because a rewritten unit combined with a
manager that cannot run it is worse than a stale one. macOS launch agents cannot
start before the user logs in; installing over SSH while nobody is logged in can
fail at the final start step and is documented as such.

## Desktop app updates

Desktop app updates are separate from service maintenance: the app's own update
feed decides what it downloads, and installing it stops the bundled backend.
That is why the handoff is two-phase — preparation returns a token while the
connection is alive, and the client commits it only after receiving it, so a
backend shutdown cannot lose the only successful RPC result.

## Recovering interrupted threads

Restart continuation is an environment-owned preference, off by default. The
[v2 recovery service](../../apps/server/src/orchestration-v2/ProviderRuntimeRecoveryService.ts)
requires matching durable run, provider thread, session, and native resume identity.
Ordinary queued work, finished runs, and background-only work do not qualify.

Recovery retires effects tied to the lost process and records continuation intent
in the durable outbox. That intent survives another restart before provider startup.
Continuation effects wait for activation; a slow provider must not delay the server's
readiness. Graceful shutdown captures intent before
closing providers, then reconciles after ingestion has stopped so a late completion
cannot be overwritten by a stale cancellation.

The [continuation handler](../../apps/server/src/orchestration-v2/RestartContinuation.ts)
rechecks the preference, archive state, provider selection, and newer user work before
dispatching. Stable command and message IDs prevent duplicate submissions after an
outbox retry. Codex resumes without adding provider prompt text; other adapters receive
the continuation message through their normal turn path.
