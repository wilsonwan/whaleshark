import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { Launcher, readServiceState } from "./serviceLauncher.ts";
import {
  decodeServiceState,
  isExactServiceVersion,
  SERVICE_LAUNCHER_PROTOCOL,
  SERVICE_STATE_FILE,
  SERVICE_STOP_MARKER_FILE,
} from "./service/serviceProtocol.ts";

it("accepts only exact semantic versions", () => {
  for (const version of ["0.0.0", "1.2.3", "1.2.3-alpha.1", "1.2.3-0", "1.2.3+001"]) {
    assert.isTrue(isExactServiceVersion(version), version);
  }
  for (const version of ["latest", "01.2.3", "1.2.3-01", "1.2.3-alpha..1", "1.2.3+."]) {
    assert.isFalse(isExactServiceVersion(version), version);
  }
});

it("accepts one source entry and rejects incomplete service state", () => {
  assert.deepEqual(
    decodeServiceState({
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      activeVersion: "0.0.31",
      entryPath: "/opt/t3/dist/bin.mjs",
    }),
    {
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      activeVersion: "0.0.31",
      entryPath: "/opt/t3/dist/bin.mjs",
    },
  );

  for (const value of [
    { protocol: SERVICE_LAUNCHER_PROTOCOL, activeVersion: "0.0.31" },
    { protocol: SERVICE_LAUNCHER_PROTOCOL, activeVersion: "0.0.31", entryPath: "" },
    { protocol: SERVICE_LAUNCHER_PROTOCOL - 1, activeVersion: "0.0.31", entryPath: "/t3" },
    { protocol: SERVICE_LAUNCHER_PROTOCOL, activeVersion: "latest", entryPath: "/t3" },
    { protocol: SERVICE_LAUNCHER_PROTOCOL, activeVersion: 31, entryPath: "/t3" },
  ]) {
    assert.isUndefined(decodeServiceState(value));
  }
});

const waitForFile = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    for (let attempt = 0; attempt < 250; attempt += 1) {
      if (yield* fs.exists(filePath)) return yield* fs.readFileString(filePath);
      yield* Effect.sleep("20 millis");
    }
    return undefined;
  });

it.layer(NodeServices.layer)("service launcher", (it) => {
  it.effect("strictly reads the state document it was installed with", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-service-launcher-test-" });
      const statePath = path.join(root, "runtime", SERVICE_STATE_FILE);
      yield* fs.makeDirectory(path.dirname(statePath), { recursive: true });
      const state = {
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "0.0.31",
        entryPath: path.join(root, "bin.mjs"),
      } as const;

      // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned test document.
      yield* fs.writeFileString(statePath, `${JSON.stringify(state, null, 2)}\n`);
      assert.deepEqual(yield* Effect.promise(() => readServiceState(statePath)), state);

      yield* fs.writeFileString(statePath, '{"protocol":2,"activeVersion":"0.0.31"}\n');
      const error = yield* Effect.promise(() =>
        readServiceState(statePath).then(
          () => undefined,
          (cause: unknown) => cause,
        ),
      );
      assert.instanceOf(error, Error);
    }),
  );

  it.effect("fails loudly when the recorded source entry is gone", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-service-launcher-missing-" });
      const launcher = new Launcher(root, {
        protocol: SERVICE_LAUNCHER_PROTOCOL,
        activeVersion: "1.0.0",
        entryPath: path.join(root, "missing", "bin.mjs"),
      });

      const error = yield* Effect.promise(() =>
        launcher.run().then(
          () => undefined,
          (cause: unknown) => cause,
        ),
      );
      assert.instanceOf(error, Error);
      assert.include((error as Error).message, "t3 service install");
    }),
  );
});

// The launcher drives a real subprocess, so this test runs on the live clock.
it.live("starts the recorded source entry and terminates it on an explicit stop", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-service-launcher-start-" });
    const entryPath = path.join(root, "bin.mjs");
    const startedPath = path.join(root, "started.json");
    yield* fs.writeFileString(
      entryPath,
      [
        'import { writeFileSync } from "node:fs";',
        // @effect-diagnostics-next-line preferSchemaOverJson:off - embeds a path in fake child source.
        `writeFileSync(${JSON.stringify(startedPath)}, JSON.stringify({`,
        '  context: JSON.parse(process.env.T3_SERVICE_LAUNCHER_CONTEXT ?? "null"),',
        "  pid: process.pid,",
        "  argv: process.argv.slice(1),",
        "}));",
        "setInterval(() => {}, 1_000);",
        "",
      ].join("\n"),
    );
    const statePath = path.join(root, "runtime", SERVICE_STATE_FILE);
    const state = {
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      activeVersion: "1.0.0",
      entryPath,
    } as const;
    yield* fs.makeDirectory(path.dirname(statePath), { recursive: true });
    // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed launcher-owned test document.
    yield* fs.writeFileString(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const launcher = new Launcher(root, state);
    const running = launcher.run();
    const started = yield* waitForFile(startedPath);
    assert.isDefined(started);
    // @effect-diagnostics-next-line preferSchemaOverJson:off - decodes the fake child's own report.
    const child = JSON.parse(started ?? "{}") as {
      context?: { protocol?: number; childVersion?: string };
      pid?: number;
      argv?: ReadonlyArray<string>;
    };
    assert.deepEqual(child.context, {
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      childVersion: "1.0.0",
    });
    assert.deepEqual(child.argv, [entryPath, "serve"]);

    yield* Effect.promise(() => launcher.stop("SIGTERM"));
    // An explicit stop leaves the marker that tells a child shutting down
    // that no replacement server is coming.
    assert.isTrue(yield* fs.exists(path.join(root, "runtime", SERVICE_STOP_MARKER_FILE)));
    yield* Effect.promise(() => running);
    assert.isFalse(pidAlive(child.pid));
  }).pipe(Effect.provide(NodeServices.layer)),
);

function pidAlive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
