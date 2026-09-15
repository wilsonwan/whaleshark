# Welcome wizard

T3 Code shows a setup flow when you open a new installation or connect from a
new client for the first time. Existing workspaces skip this flow.

## Connect your computers

Select one or more computers to set up. If you opened T3 Code directly from a
server or the desktop app, that computer is already connected and selected.
It is identified by its name, which may differ from the device running your
browser.

You can add more computers before continuing:

- **Add a computer** connects directly to a server on your network or tailnet.
  From the repository root, start the source checkout with
  `node apps/server/src/bin.ts serve --tailscale-serve`, then run
  `node apps/server/src/bin.ts pair --tailscale` and paste the pairing link.
  For a directly reachable network address, use
  `node apps/server/src/bin.ts serve --host <address>` and
  `node apps/server/src/bin.ts pair` instead.

Saved computers are selected by default. Uncheck any you do not want to set up;
this does not disconnect them.
Continue when your selected computers are connected. Setup checks
agents across the selected computers before opening the workspace.

If T3 Code cannot confirm the workspace during startup, the setup flow shows
**Still connecting** instead of opening the app. Select **Reload** to try again.

If T3 Code cannot read your saved settings, it shows **Could not read settings**.
Select **Retry** after storage becomes available. Setup does not replace
unreadable settings with defaults.

## Check your agents

T3 Code checks each selected computer for Claude Code and Codex. If an agent is
not installed or signed in, select its action to open a terminal with the
correct command ready to run. Install uses the vendor's standalone installer,
which does not need Node or npm and keeps **Update now** working in Settings.
Other providers can be enabled in Settings.

The setup terminal uses the home directory and environment configured for the
selected provider instance. Sensitive values remain redacted in Settings and
terminal metadata while the terminal process can use them.

You can continue without configuring agents or return to an earlier step using
the setup progress bar.
