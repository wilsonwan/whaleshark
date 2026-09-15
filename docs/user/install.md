# Install T3 Code

T3 Code runs coding agents on your computer and lets you control them from its
desktop app or responsive web app. Set up the machine where the agents will work
first.

This fork is not published as a package. You install it by checking out this
repository and building it, and you update it by pulling, rebuilding, and
restarting. There is no release channel to install from.

## Requirements

Command-line use, SSH hosts, and WSL backends need Node.js 22.16+ (22.x), 23.11+
(23.x), or 24.10 and later. You also need the `vp` command-line tool; see
[Install vp](../../README.md#install-vp).

You need an installed, authenticated provider before starting a thread. You can
launch T3 Code and configure providers afterwards.

## Run from source

From the repository root:

```sh
vp i
vp run dev
```

This starts the server and the local web app. Run `vp run dev --help` for
options, or `node apps/server/src/bin.ts --help` for the command-line reference.

For a server you keep running, build it and use the built CLI:

```sh
vp run build
node apps/server/dist/bin.mjs
```

## Desktop app

Build the desktop app from the same checkout:

| Platform | Command                     |
| -------- | --------------------------- |
| Linux    | `vp run dist:desktop:linux` |
| Windows  | `vp run dist:desktop:win`   |

### Windows Subsystem for Linux

Choose a WSL distro in **Settings → Connections** to run agents and projects
there. Install Node.js and provider CLIs inside that distro. T3 Code installs its
matching server runtime there automatically; the first launch after rebuilding
the app can take longer.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
node apps/server/dist/bin.mjs app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `node apps/server/dist/bin.mjs app ../my-project`, to open
another directory. It requires the desktop app, so a standalone server or an SSH
session is not enough. If the command cannot reach the app, start the desktop app
and try again.

## Phone and remote access

The responsive web app is the phone surface. Start T3 Code on the machine where
agents run, then open its pairing URL from the phone or another computer. See
[remote access](./remote-access.md) for pairing, local-network, Tailscale, and
T3 Connect options.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider | Install and authenticate                                                               |
| -------- | -------------------------------------------------------------------------------------- |
| Codex    | Install [Codex CLI](https://developers.openai.com/codex/cli), then run `codex login`.  |
| OpenCode | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.               |
| Pi       | Install [Pi](https://pi.dev), then run `pi` once to finish its login or API-key setup. |

Provider CLIs must be on the server's `PATH`. If T3 Code cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** appears only when T3 Code can tell which
installer owns the CLI (its own update command, Homebrew, or a global npm, pnpm,
bun, or Vite+ install) and runs that installer. Otherwise update the CLI the same
way you installed it. Homebrew installs compare against the version Homebrew
offers, which can trail the npm release by a few hours.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, T3 Code does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[OpenCode](./providers-opencode.md), and [Pi](./providers-pi.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a Linux or macOS host available.
- [Updating T3 Code](./updating.md): rebuild the app and the connected servers.
