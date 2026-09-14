# Running T3 Code in the background

On Linux and macOS, T3 Code can run as a service for your user so you do not need
to keep a terminal open.

This fork is not published as a package and has no release channel. The service
runs the checkout you install it from: building a new build and reinstalling the
service is what "updating" means here.

## Prepare the checkout

From the repository root, build the server you want to run in the background:

```sh
vp i
vp run build
```

Installing records the CLI entry the service starts, so run these commands from
the same checkout you built.

## Manage the service

| Task                            | Command                                           |
| ------------------------------- | ------------------------------------------------- |
| Install and start               | `node apps/server/dist/bin.mjs service install`   |
| Inspect status and log location | `node apps/server/dist/bin.mjs service status`    |
| Stop and remove from startup    | `node apps/server/dist/bin.mjs service uninstall` |

Installing copies the launcher into your T3 home and points systemd or launchd
at it. Running `service install` again repairs the service or switches it to the
checkout and build you ran it from, restarting the server in the process. There
is no `service update` command: `t3 service install` is the only way to install,
repair, or move the service. Uninstalling leaves your projects, threads, and
settings intact.

Running from source instead of a build works the same way with
`node apps/server/src/bin.ts service install`, but `vp run dev` is the better
path while you are developing. Updating the service restarts the server, so
finish active work first.

## Platform support

Linux needs systemd user services. Setup enables lingering so T3 Code starts at
boot and keeps running after logout. If this needs administrator permission,
setup prints a recovery command before changing the service.

macOS starts the service when you log in and stops it when you log out. Keep the
Mac logged in and awake for unattended remote access. Installing over SSH while
nobody is logged in at the Mac's screen can fail at the final start step; the
service is still installed and will start at the next login.

Windows background services are not supported.

## Troubleshooting

Start with `t3 service status` on the host. It prints the log path and, on Linux,
checks whether the installed service is running, enabled, and allowed to survive
logout.

If it stops when your SSH session closes, check for `linger-disabled`. An
administrator can enable lingering with:

```sh
sudo loginctl enable-linger "$(id -un)"
```

Over SSH, allow sudo to prompt:

```sh
ssh -t your-server 'sudo loginctl enable-linger "$(id -un)"'
```

Then retry service setup as your normal user. Run only the `loginctl` command
with sudo; running T3 Code as root creates a separate installation and identity.
Without administrator access, run `t3 serve` in a terminal and keep
that session open.

| Status problem                          | Next step                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `linger-unavailable`                    | Run `loginctl show-user "$(id -un)" --property=Linger` and check that systemd-logind is available.                                |
| `user-manager-unavailable`              | Run `systemctl --user status` in a login session for the service user; check your distribution's systemd user-session support.    |
| `service-disabled` or `service-stopped` | Read the log and `systemctl --user status t3code.service`, then repair the service with `t3 service install`.                     |
| Service needs a reinstall               | The install no longer matches this checkout, or a source entry moved. Run `t3 service install` from the checkout you want to run. |

On macOS, check **System Settings → General → Login Items** if the service no
longer starts at login. If agent work cannot access Desktop, Documents, or
Downloads, it may need Full Disk Access for the Node executable listed in
`ProgramArguments` in
`~/Library/LaunchAgents/com.t3tools.t3code.service.plist`.

For connection failures, see
[remote access troubleshooting](./remote-access.md#troubleshooting).
