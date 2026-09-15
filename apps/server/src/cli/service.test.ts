import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, it } from "@effect/vitest";
import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import * as NetService from "@t3tools/shared/Net";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Terminal from "effect/Terminal";
import { Command } from "effect/unstable/cli";
import { afterEach, vi } from "vite-plus/test";

import packageJson from "../../package.json" with { type: "json" };
import * as BootService from "../service/bootService.ts";
import {
  formatServiceStatus,
  offerServiceDuringOnboarding,
  reconcileService,
  recoverServiceOnboardingOffer,
  serviceCommand,
} from "./service.ts";

afterEach(() => vi.restoreAllMocks());

const status = {
  supported: true,
  installed: true,
  current: true,
  unitPath: "/home/me/.config/systemd/user/t3code.service",
  logPath: "/home/me/.t3/userdata/logs/boot-service.log",
} as const;

it("reports the installed service version and host paths", () => {
  assert.equal(
    formatServiceStatus(status, "0.0.29"),
    [
      "T3 Code service",
      "  Status: installed · t3@0.0.29",
      "  Unit: /home/me/.config/systemd/user/t3code.service",
      "  Logs: /home/me/.t3/userdata/logs/boot-service.log",
    ].join("\n"),
  );
});

it("directs a stale service at a source reinstall", () => {
  const output = formatServiceStatus({ ...status, current: false }, "0.0.29");

  assert.include(output, "Next: Run `t3 service install` from the checkout you want to run.");
  assert.notInclude(output, "service update");
});

it("still reports the installed version when the service needs a reinstall", () => {
  const output = formatServiceStatus(
    {
      ...status,
      current: false,
      installedVersion: "0.0.32-dev.1",
      problems: ["linger-disabled", "service-stopped"],
    },
    "0.0.29",
  );

  expect(output).toContain("[linger-disabled]");
  expect(output).toContain("last login session ends");
  expect(output).toContain('sudo loginctl enable-linger "$(id -un)"');
  expect(output).toContain("[service-stopped]");
  expect(output).toContain("needs a reinstall from this checkout");
  expect(output).not.toContain("t3@latest");
});

it("explains where the service is supported", () => {
  assert.include(
    formatServiceStatus({ ...status, supported: false, installed: false }, "0.0.29"),
    "Supported on: Linux with systemd, macOS with launchd",
  );
});

function makeTestService(serviceStatus: BootService.BootServiceStatus) {
  let installs = 0;
  const service = BootService.BootService.of({
    status: Effect.succeed(serviceStatus),
    install: Effect.sync(() => {
      installs += 1;
      return {
        nodePath: "/test/node",
        launcherPath: "/test/service-launcher.mjs",
        baseDir: "/test/t3",
        unitPath: serviceStatus.unitPath,
        logPath: serviceStatus.logPath,
      };
    }),
    uninstall: Effect.succeed(false),
  });
  return { service, installs: () => installs };
}

it.layer(Layer.mergeAll(NodeServices.layer, NetService.layer))("service commands", (it) => {
  it.effect("installs or repairs the service from the running checkout", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-service-cli-test-" });
      const { service, installs } = makeTestService({ ...status, current: false });
      vi.spyOn(BootService, "layer").mockReturnValue(
        Layer.succeed(BootService.BootService, service),
      );

      yield* Command.runWith(serviceCommand, { version: packageJson.version })([
        "install",
        "--base-dir",
        baseDir,
      ]).pipe(
        Effect.provideService(HostProcessEnvironment, {}),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
      );

      expect(installs()).toBe(1);
    }),
  );

  it.effect("leaves an installed service alone when it matches this checkout", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-service-cli-test-" });
      const { service, installs } = makeTestService(status);
      vi.spyOn(BootService, "layer").mockReturnValue(
        Layer.succeed(BootService.BootService, service),
      );

      yield* Command.runWith(serviceCommand, { version: packageJson.version })([
        "install",
        "--base-dir",
        baseDir,
      ]).pipe(
        Effect.provideService(HostProcessEnvironment, {}),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
      );

      expect(installs()).toBe(0);
    }),
  );

  it.effect("no longer offers a service update command", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-service-cli-test-" });
      const { service, installs } = makeTestService({ ...status, current: false });
      vi.spyOn(BootService, "layer").mockReturnValue(
        Layer.succeed(BootService.BootService, service),
      );

      yield* Command.runWith(serviceCommand, { version: packageJson.version })([
        "update",
        "--base-dir",
        baseDir,
      ]).pipe(
        Effect.provideService(HostProcessEnvironment, {}),
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
        Effect.flip,
      );

      expect(installs()).toBe(0);
    }),
  );
});

it.effect.each([
  { name: "a new service", state: { ...status, installed: false, current: false } },
  { name: "a service from another checkout", state: { ...status, current: false } },
  {
    name: "an incomplete install of the same version",
    state: {
      ...status,
      current: false,
      installedVersion: packageJson.version,
      problems: ["linger-disabled"] as const,
    },
  },
  { name: "an unknown version", state: { ...status, current: false } },
])("reinstalls $name", ({ state }) =>
  Effect.gen(function* () {
    const { service, installs } = makeTestService(state);

    const result = yield* reconcileService().pipe(
      Effect.provideService(BootService.BootService, service),
    );

    expect(result.changed).toBe(true);
    expect(installs()).toBe(1);
  }),
);

it.effect("leaves a current service untouched", () =>
  Effect.gen(function* () {
    const { service, installs } = makeTestService(status);

    const result = yield* reconcileService().pipe(
      Effect.provideService(BootService.BootService, service),
    );

    expect(result.changed).toBe(false);
    expect(installs()).toBe(0);
  }),
);

it.effect("recognizes an already-configured service during onboarding without prompting", () =>
  Effect.gen(function* () {
    const { service, installs } = makeTestService(status);
    const terminal = Terminal.make({
      columns: Effect.succeed(80),
      rows: Effect.succeed(24),
      readInput: Effect.die("Onboarding must not prompt for a current service."),
      readLine: Effect.die("Onboarding must not prompt for a current service."),
      display: () => Effect.die("Onboarding must not prompt for a current service."),
    });

    const ready = yield* offerServiceDuringOnboarding.pipe(
      Effect.provideService(BootService.BootService, service),
      Effect.provideService(Terminal.Terminal, terminal),
      Effect.provide(NodeServices.layer),
    );

    expect(ready).toBe(true);
    expect(installs()).toBe(0);
  }),
);

it.effect("keeps the manual-server fallback when background prerequisites fail", () =>
  Effect.gen(function* () {
    const ready = yield* recoverServiceOnboardingOffer(
      Effect.fail(new BootService.BootServicePrerequisiteError({ problem: "linger-disabled" })),
    );
    expect(ready).toBe(false);
  }),
);

it.effect("keeps the manual-server fallback when the service cannot be installed", () =>
  Effect.gen(function* () {
    const ready = yield* recoverServiceOnboardingOffer(
      Effect.fail(new BootService.BootServiceInstallError({ cause: new Error("denied") })),
    );
    expect(ready).toBe(false);
  }),
);
