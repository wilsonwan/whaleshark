# T3 Code

T3 Code is an "agent harness control surface". It enables control of the agents on your machine with a responsive web app served by your own server and an [Electron-based desktop app](https://t3.codes).

Works with your subscriptions on Claude Code, Codex, OpenCode, and Pi. Agents from the [ACP Registry](https://agentclientprotocol.com/get-started/registry) work too. If they're set up on your computer, T3 Code can control them.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork and build the editor that you want.

## Installation

This fork publishes nothing: there is no release channel, no published package,
and no packaged installer. You run it from a checkout of this repository, and you
update it by pulling, rebuilding, and restarting. See
[Install T3 Code](./docs/user/install.md).

> [!WARNING]
> T3 Code currently supports Codex, Claude, OpenCode, and Pi, plus agents from the ACP Registry. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`
> - Pi: install [Pi](https://pi.dev) and run `pi` once to finish its login or API-key setup.
> - ACP Registry: add an agent from the [ACP Registry](./docs/user/providers-acp.md) under **Settings → Providers**.

### Run from source

Clone this repository and run the server and web app (requires Node.js 22.16+,
23.11+, or 24.10+ and [vp](#install-vp)):

```bash
vp i
vp run dev
```

This launches T3 Code's backend on your machine as well as the local web app to
control your agents. Tip: Use `vp run dev --help` for the full CLI reference.

### Desktop app

Build the desktop app from the same checkout:

| Platform | Command                     |
| -------- | --------------------------- |
| Linux    | `vp run dist:desktop:linux` |
| Windows  | `vp run dist:desktop:win`   |

Local builds are unsigned; see
[Development](./docs/operations/development.md#desktop-artifacts) for
prerequisites.

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Project settings](./docs/user/project-settings.md)
- [Appearance preferences](./docs/user/appearance.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Updating T3 Code](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- [Run T3 Code as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.

Have a feature request? Start an [Ideas discussion](https://github.com/pingdotgg/t3code/discussions/categories/ideas).

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
