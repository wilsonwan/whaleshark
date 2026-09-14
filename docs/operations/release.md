# Desktop artifacts and signing

> For maintainers. Using T3 Code? See [docs/user](../user/).

This fork publishes nothing. There is no release workflow, no published `t3`
package, no AUR package, no desktop update feed, and no release announcement.
Local desktop builds exist so the desktop client can be run and tested; they are
not a distribution channel.

## Local builds

```sh
vp run dist:desktop:dmg
vp run dist:desktop:linux
vp run dist:desktop:win
```

Builds are unsigned by default and write to `release/`. See
[Development](./development.md#desktop-artifacts) for prerequisites and options.

## Signing (optional)

A signed, provisioned app is required for macOS notarization, so signing is only
worth setting up when you need a signed local build. Export the certificate and
provisioning profile yourself and pass `--signed`; the repository no longer
carries the release credentials or the workflow that used them.

macOS needs a `Developer ID Application` certificate plus an App Store Connect
API key for notarization, and an explicit App ID for `com.t3tools.t3code` with
Associated Domains enabled. Windows signing needs an Azure Trusted Signing
account and certificate profile. Keep those values in your own environment.

## Server and service maintenance

The background service runs the checkout it was installed from, so keeping a
server current means pulling, building, and running `t3 service install` from
that checkout. See [Updating T3 Code](../user/updating.md) and
[Running T3 Code in the background](../user/background-service.md).

## Unresolved: remote CLI package source

`packages/ssh` still resolves a published `t3@latest` / `t3@nightly` package to
launch a server on a remote host over SSH. This fork does not publish that
package, so an SSH-launched remote server needs a source checkout, a local
artifact, or an alternate runner before it works. The resolver and its shared
contracts are intentionally intact; replacing them belongs with the Pi remote
integration follow-up.

## Windows payload topology and update validation

Windows packages the bundled server and only its runtime-external/native
dependency closure in `resources/server.asar`. Native modules and helper
executables declared as unpacked by that archive must be present at the matching
paths below `resources/server.asar.unpacked`. The Windows-native backend reads
the archive in place through Electron. Packaged Windows builds also ship a
Linux-only `resources/wsl-runtime.tar.gz` plus its SHA-256 sidecar. WSL verifies
and extracts that archive into `~/.t3/wsl-runtime/sha256-<archive-digest>` inside
the selected distro, then reuses it for later launches of the same build. The
Windows-side `wsl-server-tree/<version>` extraction remains a fallback and is
removed after the distro-local runtime passes preflight.

Windows keeps JavaScript and package metadata inside `app.asar` and unpacks only
native libraries and helper executables. Avoid enabling whole-package smart
unpacking: each loose file adds work to NSIS installation and counts against
the payload limit.

The artifact builder rejects a Windows package when any of these invariants
break:

- `resources/server.asar` is absent or does not contain the server entry.
- Any file marked unpacked in the ASAR header is absent from
  `resources/server.asar.unpacked`.
- On same-architecture Windows builds, the packaged primary cannot load the fff
  native library from inside `server.asar` through its `.unpacked` sibling.
- The isolated, extracted sidecar cannot load the server entry with plain Node.
- A Windows build with a WSL node-pty prebuild omits the WSL archive or SHA-256
  sidecar, the sidecar digest does not match the emitted archive, or required
  Linux runtime members are absent.
- The emitted WSL archive contains Windows/Darwin node-pty payloads, ConPTY,
  pnpm install metadata, or Windows-only FFF, ffi-rs, or msgpackr bindings.
- The external Windows resource monitor is absent.
- The unpacked Windows application contains more than 80 files.

Cross-architecture Windows builds retain every structural and extracted-sidecar
check, but skip executing the target Electron binary. A same-architecture build
must exercise the primary native-load probe.

NSIS differential packaging remains enabled. A sidecar layout transition can
produce a larger one-time download; subsequent local builds retain their
blockmaps, with a 60 MB maximum for a representative sidecar-to-sidecar build.
