import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  HostProcessArguments,
  HostProcessExecutablePath,
  HostProcessPlatform,
  HostProcessUserId,
} from "@t3tools/shared/hostProcess";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import * as ProcessRunner from "../processRunner.ts";
import * as BootService from "./bootService.ts";
import { parseServiceState, SERVICE_LAUNCHER_PROTOCOL } from "./serviceProtocol.ts";

it("keeps systemd pinned to the stable launcher rather than a versioned server", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.t3/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.t3",
    logPath: "/home/theo/.t3/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/t3code.service",
  });

  expect(unit).toContain("ExecStart=/usr/bin/node /home/theo/.t3/runtime/service-launcher.mjs");
  expect(unit).toContain("KillMode=mixed");
  expect(unit).not.toContain("versions/1.2.3");
});

it("survives the kernel OOM-killing a greedy agent child", () => {
  const unit = BootService.renderBootServiceUnit({
    nodePath: "/usr/bin/node",
    launcherPath: "/home/theo/.t3/runtime/service-launcher.mjs",
    baseDir: "/home/theo/.t3",
    logPath: "/home/theo/.t3/userdata/logs/boot-service.log",
    unitPath: "/home/theo/.config/systemd/user/t3code.service",
  });

  expect(unit).toContain("OOMPolicy=continue");
});

const macPlan = {
  nodePath: "/opt/homebrew/bin/node",
  launcherPath: "/Users/theo/.t3/runtime/service-launcher.mjs",
  baseDir: "/Users/theo/.t3",
  logPath: "/Users/theo/.t3/userdata/logs/boot-service.log",
  unitPath: "/Users/theo/Library/LaunchAgents/com.t3tools.t3code.service.plist",
};
const macInstallerPath =
  "/opt/homebrew/bin:/Users/theo/.npm-global/bin:/Users/theo/.nvm/versions/node/v22.16.0/bin:/usr/bin:/bin";
const macRenderOptions = { homeDir: "/Users/theo", environmentPath: macInstallerPath };

it("keeps launchd pinned to the stable launcher rather than a versioned server", () => {
  const plist = BootService.renderBootServicePlist(macPlan, macRenderOptions);

  expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
  expect(plist).toContain("<string>/Users/theo/.t3/runtime/service-launcher.mjs</string>");
  expect(plist).not.toContain("versions/1.2.3");
});

it("preserves the installer's provider search path in the launch agent", () => {
  const plist = BootService.renderBootServicePlist(macPlan, macRenderOptions);

  expect(plist).toContain(`    <key>PATH</key>\n    <string>${macInstallerPath}</string>`);
});

it("restarts the launch agent on the systemd cadence", () => {
  const plist = BootService.renderBootServicePlist(macPlan, macRenderOptions);

  expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
  expect(plist).toContain("<key>KeepAlive</key>\n  <true/>");
  expect(plist).toContain("<key>ThrottleInterval</key>\n  <integer>5</integer>");
  expect(plist).toContain("<key>ExitTimeOut</key>\n  <integer>90</integer>");
});

it("appends both stdio streams to the boot service log", () => {
  const plist = BootService.renderBootServicePlist(macPlan, macRenderOptions);

  expect(plist).toContain(
    "<key>StandardOutPath</key>\n  <string>/Users/theo/.t3/userdata/logs/boot-service.log</string>",
  );
  expect(plist).toContain(
    "<key>StandardErrorPath</key>\n  <string>/Users/theo/.t3/userdata/logs/boot-service.log</string>",
  );
});

it("escapes XML in host paths", () => {
  const plist = BootService.renderBootServicePlist(
    { ...macPlan, baseDir: "/Users/theo/T3 & <Co>" },
    { homeDir: "/Users/theo", environmentPath: "/Users/theo/Tools & <Scripts>:/usr/bin" },
  );

  expect(plist).toContain("<string>/Users/theo/T3 &amp; &lt;Co&gt;</string>");
  expect(plist).toContain("<string>/Users/theo/Tools &amp; &lt;Scripts&gt;:/usr/bin</string>");
});

const makeHarness = Effect.fn("test.make_boot_service_harness")(function* (
  platform: NodeJS.Platform = "linux",
  options?: { readonly installerPath?: string; readonly launcherSourcePath?: string | null },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const installerPath = options?.installerPath ?? macInstallerPath;
  const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-boot-service-test-" });
  const baseDir = path.join(home, ".t3");
  const sourceLauncher = path.join(home, "service-launcher.mjs");
  // The installed service runs the build that installed it: the CLI entry and
  // the launcher source both come from the running checkout.
  const cliEntryPath = path.join(home, "bin.mjs");
  const statePath = path.join(baseDir, "runtime", "service-state.json");
  yield* fs.writeFileString(sourceLauncher, "export {};\n");
  yield* fs.writeFileString(cliEntryPath, "export {};\n");

  const commands: string[] = [];
  const timeouts = new Map<string, unknown>();
  const control: {
    failCommand: string | undefined;
    linger: string;
    enabled: boolean;
    active: boolean;
  } = {
    failCommand: undefined,
    linger: "yes",
    enabled: true,
    active: true,
  };
  const runner = ProcessRunner.ProcessRunner.of({
    run: Effect.fn("test.run_boot_service_command")((input: ProcessRunner.ProcessRunInput) => {
      const command = `${input.command} ${input.args.join(" ")}`;
      commands.push(command);
      timeouts.set(command, input.timeout);
      const failed = command === control.failCommand;
      if (!failed && command === "loginctl enable-linger --no-ask-password 501")
        control.linger = "yes";
      if (!failed && command === "systemctl --user enable t3code.service") control.enabled = true;
      if (!failed && command === "systemctl --user restart t3code.service") control.active = true;
      return Effect.succeed({
        stdout:
          input.command === "loginctl" && input.args[0] === "show-user"
            ? `${control.linger}\n`
            : input.args[1] === "is-enabled"
              ? control.enabled
                ? "enabled\n"
                : "disabled\n"
              : "",
        stderr: "",
        code: ChildProcessSpawner.ExitCode(
          failed || (input.args[1] === "is-active" && !control.active) ? 1 : 0,
        ),
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        stdoutInvalidUtf8: false,
        stderrInvalidUtf8: false,
      });
    }),
  });
  const makeService = (serviceInstallerPath = installerPath) =>
    BootService.make({
      baseDir,
      logsDir: path.join(baseDir, "userdata", "logs"),
      cliVersion: "1.2.3",
      host: {
        execPath: "/usr/bin/node",
        ...(options?.launcherSourcePath === null ? {} : { launcherSourcePath: sourceLauncher }),
      },
    }).pipe(
      Effect.provideService(ProcessRunner.ProcessRunner, runner),
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(HostProcessPlatform, platform),
          Layer.succeed(HostProcessUserId, 501),
          Layer.succeed(HostProcessExecutablePath, "/usr/bin/node"),
          Layer.succeed(HostProcessArguments, ["/usr/bin/node", cliEntryPath]),
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                HOME: home,
                ...(serviceInstallerPath === "" ? {} : { PATH: serviceInstallerPath }),
              },
            }),
          ),
        ),
      ),
    );
  const service = yield* makeService();
  return {
    service,
    makeService,
    fs,
    statePath,
    commands,
    timeouts,
    control,
    cliEntryPath,
    sourceLauncher,
  };
});

it.layer(NodeServices.layer)("boot service install", (it) => {
  it.effect(
    "fails before installing files or validating a runtime when lingering needs an administrator",
    () =>
      Effect.gen(function* () {
        const { service, fs, statePath, commands, control } = yield* makeHarness();
        const before = yield* service.status;
        control.linger = "no";
        control.failCommand = "loginctl enable-linger --no-ask-password 501";

        const error = yield* service.install.pipe(Effect.flip);

        expect(error).toMatchObject({
          _tag: "BootServicePrerequisiteError",
          problem: "linger-disabled",
        });
        expect(error.message).toContain('sudo loginctl enable-linger "$(id -un)"');
        expect(error.message).toContain("last login session ends");
        expect(yield* fs.exists(before.unitPath)).toBe(false);
        expect(yield* fs.exists(statePath)).toBe(false);
        expect(
          commands.some((command) => command.startsWith("npm ") || command.includes("--version")),
        ).toBe(false);
        expect(
          commands.some(
            (command) => command.includes("daemon-reload") || command.includes("restart"),
          ),
        ).toBe(false);
        expect(yield* fs.readFileString(before.logPath)).toContain("[linger-disabled]");
      }),
  );

  it.effect(
    "detects a partial install and preserves the running service when repair lacks permission",
    () =>
      Effect.gen(function* () {
        const { service, fs, statePath, commands, control } = yield* makeHarness();
        const plan = yield* service.install;
        const before = yield* fs.readFileString(statePath);
        const unit = yield* fs.readFileString(plan.unitPath);
        control.linger = "no";
        control.failCommand = "loginctl enable-linger --no-ask-password 501";

        expect(yield* service.status).toMatchObject({
          current: false,
          problems: ["linger-disabled"],
        });
        commands.length = 0;
        expect((yield* service.install.pipe(Effect.flip))._tag).toBe(
          "BootServicePrerequisiteError",
        );
        expect(yield* fs.readFileString(statePath)).toBe(before);
        expect(yield* fs.readFileString(plan.unitPath)).toBe(unit);
        expect(commands).not.toContain("systemctl --user stop t3code.service");
      }),
  );

  it.effect("enables lingering before installing and repairs stopped or disabled services", () =>
    Effect.gen(function* () {
      const { service, commands, control } = yield* makeHarness();
      control.linger = "no";
      yield* service.install;
      expect(control.linger).toBe("yes");
      expect(commands.indexOf("loginctl enable-linger --no-ask-password 501")).toBeLessThan(
        commands.indexOf("systemctl --user daemon-reload"),
      );

      control.enabled = false;
      control.active = false;
      expect(yield* service.status).toMatchObject({
        current: false,
        problems: ["service-disabled", "service-stopped"],
      });
      yield* service.install;
      expect((yield* service.status).current).toBe(true);
    }),
  );

  it.effect.each([
    { command: "systemctl --user show-environment", problem: "user-manager-unavailable" },
    { command: "loginctl show-user 501 --property=Linger --value", problem: "linger-unavailable" },
  ])("reports failed prerequisite probes without installing: $command", ({ command, problem }) =>
    Effect.gen(function* () {
      const { service, fs, statePath, control } = yield* makeHarness();
      control.failCommand = command;
      expect(yield* service.install.pipe(Effect.flip)).toMatchObject({
        _tag: "BootServicePrerequisiteError",
        problem,
      });
      expect(yield* fs.exists(statePath)).toBe(false);
    }),
  );

  it.effect("installs, reports current state, and uninstalls", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands, timeouts, cliEntryPath } = yield* makeHarness();
      const plan = yield* service.install;

      expect(parseServiceState(yield* fs.readFileString(statePath))).toEqual({
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.2.3",
        entryPath: cliEntryPath,
      });
      expect(yield* fs.readFileString(plan.launcherPath)).toBe("export {};\n");
      expect(yield* service.status).toMatchObject({
        current: true,
        installedVersion: "1.2.3",
      });
      // A launcher whose source entry disappeared must not report current.
      yield* fs.remove(cliEntryPath);
      expect((yield* service.status).current).toBe(false);
      yield* fs.writeFileString(cliEntryPath, "export {};\n");
      expect(yield* service.uninstall).toBe(true);
      expect((yield* service.status).installed).toBe(false);
      expect(commands.some((command) => command.startsWith("npm "))).toBe(false);
      // The stop can block up to systemd's 90s TimeoutStopSec; the runner's
      // 60s default would cancel it mid-shutdown.
      expect(timeouts.get("systemctl --user disable --now t3code.service")).toEqual(
        Duration.seconds(120),
      );
    }),
  );

  it.effect.each(["linux", "darwin"] as const)(
    "reports the installed version across launcher protocols on %s",
    (platform) =>
      Effect.gen(function* () {
        const { service, fs, statePath } = yield* makeHarness(platform);
        yield* service.install;

        for (const protocol of [SERVICE_LAUNCHER_PROTOCOL - 1, SERVICE_LAUNCHER_PROTOCOL + 1]) {
          yield* fs.writeFileString(
            statePath,
            `{"protocol":${protocol},"activeVersion":"1.2.4-dev.1","entryPath":"/opt/t3/bin.mjs"}`,
          );
          expect(yield* service.status).toMatchObject({
            current: false,
            installedVersion: "1.2.4-dev.1",
          });
        }
      }),
  );

  it.effect("reports an unknown version for invalid service state", () =>
    Effect.gen(function* () {
      const { service, fs, statePath } = yield* makeHarness();
      yield* service.install;

      for (const stateText of [
        "{",
        '{"activeVersion":"latest"}',
        '{"activeVersion":"1.2"}',
        '{"activeVersion":123}',
      ]) {
        yield* fs.writeFileString(statePath, stateText);
        const status = yield* service.status;
        expect(status.current).toBe(false);
        expect(status.installedVersion).toBeUndefined();
      }
    }),
  );

  it.effect("copies the launcher from the build running the install", () =>
    Effect.gen(function* () {
      const { service, fs, sourceLauncher } = yield* makeHarness("linux", {
        launcherSourcePath: null,
      });
      yield* fs.writeFileString(sourceLauncher, "export const source = 'running build';\n");
      const plan = yield* service.install;

      expect(yield* fs.readFileString(plan.launcherPath)).toBe(
        "export const source = 'running build';\n",
      );
      expect((yield* service.status).current).toBe(true);
    }),
  );

  it.effect("restarts an installed service when repair fails", () =>
    Effect.gen(function* () {
      const { service, commands, control } = yield* makeHarness();
      yield* service.install;
      commands.length = 0;
      control.failCommand = "systemctl --user daemon-reload";

      const error = yield* service.install.pipe(Effect.flip);
      expect(error._tag).toBe("BootServiceCommandError");
      expect(
        commands.filter(
          (command) => command.startsWith("systemctl ") && !command.includes("show-environment"),
        ),
      ).toEqual([
        "systemctl --user stop t3code.service",
        "systemctl --user daemon-reload",
        "systemctl --user restart t3code.service",
      ]);
    }),
  );

  it.effect("fails closed on Windows", () =>
    Effect.gen(function* () {
      const { service } = yield* makeHarness("win32");
      expect((yield* service.status).supported).toBe(false);
      expect((yield* service.install.pipe(Effect.flip))._tag).toBe("BootServiceUnsupportedError");
    }),
  );

  it.effect("installs, reports current state, and uninstalls on macOS", () =>
    Effect.gen(function* () {
      const { service, fs, statePath, commands, timeouts, cliEntryPath } =
        yield* makeHarness("darwin");
      const path = yield* Path.Path;
      const plan = yield* service.install;

      expect(
        plan.unitPath.endsWith(
          path.join("Library", "LaunchAgents", "com.t3tools.t3code.service.plist"),
        ),
      ).toBe(true);
      expect(yield* fs.readFileString(plan.unitPath)).toContain(
        `    <key>PATH</key>\n    <string>${macInstallerPath}:/usr/local/bin:/usr/sbin:/sbin</string>`,
      );
      expect(parseServiceState(yield* fs.readFileString(statePath))).toEqual({
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.2.3",
        entryPath: cliEntryPath,
      });
      expect(yield* fs.readFileString(plan.launcherPath)).toBe("export {};\n");
      expect(yield* service.status).toMatchObject({
        current: true,
        installedVersion: "1.2.3",
      });
      expect(yield* service.uninstall).toBe(true);
      expect((yield* service.status).installed).toBe(false);
      expect(commands.some((command) => command.startsWith("npm "))).toBe(false);
      expect(commands.some((command) => command.startsWith("systemctl "))).toBe(false);
      // A bootout can block up to the plist's 90s ExitTimeOut; the runner's
      // 60s default would cancel it and let bootstrap race a loaded job.
      expect(timeouts.get("launchctl bootout --wait gui/501/com.t3tools.t3code.service")).toEqual(
        Duration.seconds(120),
      );
    }),
  );

  it.effect("restarts the launch agent when repair fails", () =>
    Effect.gen(function* () {
      const { service, commands, control } = yield* makeHarness("darwin");
      yield* service.install;
      const plistPath = (yield* service.status).unitPath;
      commands.length = 0;
      control.failCommand = `launchctl bootstrap gui/501 ${plistPath}`;

      const error = yield* service.install.pipe(Effect.flip);
      expect(error._tag).toBe("BootServiceCommandError");
      expect(commands.filter((command) => command.startsWith("launchctl "))).toEqual([
        "launchctl bootout --wait gui/501/com.t3tools.t3code.service",
        "launchctl enable gui/501/com.t3tools.t3code.service",
        `launchctl bootstrap gui/501 ${plistPath}`,
        `launchctl bootstrap gui/501 ${plistPath}`,
      ]);
    }),
  );

  it.effect("reconstructs a launch agent search path when the installer has no PATH", () =>
    Effect.gen(function* () {
      const { service, fs } = yield* makeHarness("darwin", { installerPath: "" });
      const plan = yield* service.install;

      expect(yield* fs.readFileString(plan.unitPath)).toContain(
        "    <key>PATH</key>\n    <string>/usr/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin</string>",
      );
      expect((yield* service.status).current).toBe(true);
    }),
  );

  it.effect("adds missing provider directories to a minimal installer PATH", () =>
    Effect.gen(function* () {
      const { service, fs } = yield* makeHarness("darwin", { installerPath: "/usr/bin:/bin" });
      const plan = yield* service.install;

      expect(yield* fs.readFileString(plan.unitPath)).toContain(
        "    <key>PATH</key>\n    <string>/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin:/usr/sbin:/sbin</string>",
      );
      expect((yield* service.status).current).toBe(true);
    }),
  );

  it.effect("keeps an installed launch agent current when the process PATH changes", () =>
    Effect.gen(function* () {
      const { service, makeService } = yield* makeHarness("darwin");
      yield* service.install;

      const restartedService = yield* makeService("/usr/local/bin:/usr/bin:/bin");
      expect((yield* restartedService.status).current).toBe(true);
    }),
  );

  it.effect("drops PATH directories that cannot be represented in a launch agent plist", () =>
    Effect.gen(function* () {
      const { service, fs } = yield* makeHarness("darwin", {
        installerPath: "/opt/homebrew/bin:/Users/theo/\u0001invalid:/usr/bin",
      });
      const plan = yield* service.install;
      const plist = yield* fs.readFileString(plan.unitPath);

      expect(plist).toContain(
        "    <key>PATH</key>\n    <string>/opt/homebrew/bin:/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin</string>",
      );
      expect(plist).not.toContain("\u0001");
      expect((yield* service.status).current).toBe(true);
    }),
  );

  it.effect("ignores a bootout for an agent that is not loaded", () =>
    Effect.gen(function* () {
      const { service, control } = yield* makeHarness("darwin");
      yield* service.install;
      control.failCommand = "launchctl bootout --wait gui/501/com.t3tools.t3code.service";

      yield* service.install;
      expect((yield* service.status).current).toBe(true);
    }),
  );
});
