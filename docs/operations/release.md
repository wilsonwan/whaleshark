# Release Checklist

> For maintainers. Using T3 Code? See [docs/user](../user/).

This document covers the unified release workflow for stable and nightly desktop releases.

## What the workflow does

- Workflow: `.github/workflows/release.yml`
- Triggers:
  - manual `workflow_dispatch` with `channel=stable`, the normal way to ship stable
  - push tag matching `v*.*.*` for a stable release of an explicit commit
  - scheduled nightly check every 30 minutes
  - manual `workflow_dispatch` with `channel=nightly`
- A manual stable release builds the commit of the latest published nightly, not `main` HEAD.
  Nightly is the release candidate: verify the nightly, then promote it. Merges to `main` keep
  landing while you verify and never leak into the stable build.
  - The version defaults to the one the nightly previewed (`0.0.39-nightly.*` ships as `0.0.39`).
    Pass the `version` input to override it, for example for a minor bump.
  - The stable tag is created on the nightly's commit when the GitHub Release is published.
  - Pushing a `vX.Y.Z` tag by hand still works and builds exactly the tagged commit. Use it when
    the commit to ship is not the latest nightly, such as a cherry-picked fix on a release branch.
- Runs lint, typecheck, and tests alongside artifact builds. Publishing waits for every check.
- Builds two artifacts in parallel for both channels:
  - Linux `x64` AppImage
  - Windows `x64` NSIS installer
- Publishes one GitHub Release with all produced files.
  - Stable tags with a suffix after `X.Y.Z` (for example `1.2.3-alpha.1`) are published as GitHub prereleases.
  - Only plain stable `X.Y.Z` releases are marked as the repository's latest release.
  - Nightly runs are always GitHub prereleases and never marked latest.
  - Automatically generated release notes are pinned to the previous tag in the same channel, so stable compares to the previous stable tag and nightly compares to the previous nightly tag.
- Includes Electron auto-update metadata (for example `latest*.yml`, `nightly*.yml`, and `*.blockmap`) in release assets.
- Publishes the CLI package (`apps/server`, npm package `t3`) with OIDC trusted publishing from the same workflow file:
  - stable releases publish npm dist-tag `latest`
  - nightly releases publish npm dist-tag `nightly`
- Windows signing is optional and auto-detected from Azure Trusted Signing secrets.

## Required release credentials

Stable releases require these GitHub Actions secrets in addition to the platform and deployment
credentials documented below:

- `RELEASE_APP_ID`
- `RELEASE_APP_PRIVATE_KEY`

The finalize job uses them to commit and push aligned package versions to `main` as the Release App.
GitHub Release publication uses the repository-scoped workflow token so it has a rate-limit quota
independent from the shared Release App installation.

## External t3.codes site

This repository does not build or deploy the public `t3.codes` site. Its legal,
download, and `t3.json` schema routes are hosted externally; clients that point
to those URLs continue to depend on that external site.

## Nightly builds

- Workflow: `.github/workflows/release.yml`
- Triggers:
  - scheduled check every 30 minutes
  - manual `workflow_dispatch` with `channel=nightly`
- Automatic nightlies require new commits and at least six hours since the last nightly was published, including manual nightlies.
- Manual nightlies bypass the time and change checks. Nightly runs remain serialized. Scheduled runs wait for an active nightly to finish, then check the publication gap before building.
- Runs the same desktop quality gates and artifact matrix as the tagged release flow.
- Publishes a GitHub prerelease only:
  - current tag format: `vX.Y.Z-nightly.YYYYMMDD.<run_number>`
  - `nightly-v...` is accepted only as a legacy previous-nightly tag
  - release name includes the short commit SHA
  - `make_latest` is always `false`
- Uses the next stable patch version as the nightly base. For example, `0.0.17` produces nightlies on `0.0.18-nightly.*`.
- Publishes Electron auto-update metadata to the dedicated `nightly` updater channel, so desktop users can opt into that track independently from stable.
- Publishes the CLI package (`apps/server`, npm package `t3`) to the `nightly` npm dist-tag using the same nightly version.
- Does not commit version bumps back to `main`.

## Server self-update release invariant

Connected servers update to the client's exact version, not to an npm dist-tag. Every released
desktop client version must therefore have a matching `t3@<version>` package available on
npm before users can receive that client.

The workflow enforces this ordering:

1. `publish_cli` publishes the exact stable or nightly version to npm.
2. `release` depends on `publish_cli` before exposing desktop artifacts in GitHub Releases.

Preserve these dependencies when changing the release graph. Publishing a client first would leave
the **Update server** action targeting a package version that does not exist yet.

For a release smoke test, confirm `npm view t3@<version> version` returns the expected version, then
connect the new client to a server on the previous version and verify that the update action
reconnects to the matching server. When the release adds database migrations, verify that the
remote update applies them and reconnects. A failed trial must restore the database snapshot and
restart the previous server. If the installed launcher does not support the target protocol,
verify that the update stops before restart and run `npx t3@<version> service update` once on the
server machine. Also test the manual or desktop-managed guidance when those environments are
available.

## Desktop auto-update notes

- Updater runtime: `apps/desktop/src/updates/DesktopUpdates.ts`.
- `electron-updater` adapter: `apps/desktop/src/electron/ElectronUpdater.ts`.
- `apps/desktop/src/main.ts` only wires the updater layers into the desktop runtime.
- Update UX:
  - Background checks run on startup delay + interval.
  - No automatic download or install.
  - The desktop UI shows a rocket update button when an update is available; click once to download, click again after download to restart/install.
- Provider: GitHub Releases (`provider: github`) configured at build time.
- Repository slug source:
  - `T3CODE_DESKTOP_UPDATE_REPOSITORY` (format `owner/repo`), if set.
  - otherwise `GITHUB_REPOSITORY` from GitHub Actions.
- Required release assets for updater:
  - platform installers (`.exe` and `.AppImage`)
  - channel metadata: `latest*.yml` for stable releases, `nightly*.yml` for nightly releases
  - `*.blockmap` files (used for differential downloads)

### Windows payload topology and update validation

Windows packages the bundled server and only its runtime-external/native
dependency closure in `resources/server.asar`. Native modules and helper
executables declared as unpacked by that archive must be present at the matching
paths below `resources/server.asar.unpacked`. The Windows-native backend reads
the archive in place through Electron. Packaged Windows builds also ship a
Linux-only `resources/wsl-runtime.tar.gz` plus its SHA-256 sidecar. WSL verifies
and extracts that archive into `~/.t3/wsl-runtime/sha256-<archive-digest>` inside
the selected distro, then reuses it for later launches of the same update. The
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
- The emitted WSL archive contains non-Linux node-pty payloads, ConPTY,
  pnpm install metadata, or Windows-only FFF, ffi-rs, or msgpackr bindings.
- The external Windows resource monitor is absent.
- The unpacked Windows application contains more than 80 files.

Cross-architecture Windows builds retain every structural and extracted-sidecar
check, but skip executing the target Electron binary. A same-architecture build
for each release target must exercise the primary native-load probe.

NSIS differential packaging remains enabled. A sidecar layout transition can
produce a larger one-time download; subsequent small releases retain their
blockmaps, with a 60 MB maximum for a representative sidecar-to-sidecar update.

## 0) npm OIDC trusted publishing setup (CLI)

The workflow invokes `node apps/server/scripts/cli.ts publish` after aligning package versions. That
script temporarily prepares the `t3` package, then runs `vp pm publish --filter t3 ...` from the
repository root so workspace publish configuration is applied correctly.

Checklist:

1. Confirm npm org/user owns package `t3` (or rename package first if needed).
2. In npm package settings, configure Trusted Publisher:
   - Provider: GitHub Actions
   - Repository: this repo
   - Workflow file: `.github/workflows/release.yml`
   - Environment (if used): match your npm trusted publishing config
3. Ensure npm account and org policies allow trusted publishing for the package.
4. Create release tag `vX.Y.Z` and push; workflow will:
   - align the release package versions to `X.Y.Z`
   - build web + server
   - invoke the CLI publish script with npm dist-tag `latest`
5. Nightly runs invoke the same publish script with npm dist-tag `nightly`.

## 1) Release validation and unsigned builds

There is no dry-run tag path. Pushing any accepted non-nightly tag, including
`v0.0.0-test.1`, classifies the run as the stable channel. It publishes `t3` with npm dist-tag
`latest`, creates a real GitHub Release, and can commit a version bump to `main` in the finalize
job. Do not push a test tag to validate the workflow.

The workflow has no non-publishing `workflow_dispatch` mode. Use normal CI or local quality gates to
validate checks and builds without shipping. To exercise the complete release graph at lower stable
risk, manually dispatch `channel=nightly`; this still publishes a real nightly npm package, GitHub
prerelease, and desktop updater release, but it does not update stable app aliases or
commit a version bump to `main`. Only run it when a real nightly release is acceptable.

Manual `channel=stable` is also a real stable-channel release. Omitting signing secrets only makes
the Windows artifact unsigned; it does not prevent publication.

## 2) Azure Trusted Signing setup (Windows)

Required secrets used by the workflow:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

Checklist:

1. Create Azure Trusted Signing account and certificate profile.
2. Record ATS values:
   - Endpoint
   - Account name
   - Certificate profile name
   - Publisher name
3. Create/choose an Entra app registration (service principal).
4. Grant service principal permissions required by Trusted Signing.
5. Create a client secret for the service principal.
6. Add Azure secrets listed above in GitHub Actions secrets.
7. Re-run a tag release and confirm Windows installer is signed.

## 3) Ongoing release checklist

1. Pick the latest nightly and verify it: run the smoke test above against its artifacts and
   check the nightly channel for regressions.
2. Dispatch the Release workflow with `channel=stable`. Leave `version` empty unless the version
   should differ from the one the nightly previewed.
3. Confirm the `Resolve release commit` notice names the nightly tag and commit you verified. If a
   newer nightly published in between, the run builds that one instead.
4. Verify workflow steps:
   - preflight passes
   - release quality checks pass
   - all matrix builds pass
   - `publish_cli` publishes the exact release version before the release job
   - release job uploads expected files
5. Smoke test downloaded artifacts.

## 4) Troubleshooting

- Windows build unsigned when expected signed:
  - Check all Azure ATS and auth secrets are populated and non-empty.
- Build fails with signing error:
  - Retry with secrets removed to confirm unsigned path still works.
  - Re-check certificate/profile names and tenant/client credentials.
