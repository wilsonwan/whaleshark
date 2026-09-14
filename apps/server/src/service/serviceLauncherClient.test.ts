import { expect, it } from "@effect/vitest";
import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";

import { SERVICE_LAUNCHER_CONTEXT_ENV, SERVICE_LAUNCHER_PROTOCOL } from "./serviceProtocol.ts";
import * as ServiceLauncherClient from "./serviceLauncherClient.ts";

class FakeLauncherProcess {
  connected = true;
  readonly env: Record<string, string | undefined>;

  constructor(context?: unknown) {
    this.env =
      context === undefined ? {} : { [SERVICE_LAUNCHER_CONTEXT_ENV]: JSON.stringify(context) };
  }
}

const makeClient = (host: FakeLauncherProcess, currentVersion: string) =>
  ServiceLauncherClient.make({ currentVersion }).pipe(
    Effect.provideService(ServiceLauncherClient.ServiceLauncherHostProcess, host),
    Effect.provideService(HostProcessEnvironment, host.env),
  );

const makeMode = (host: FakeLauncherProcess) =>
  ServiceLauncherClient.resolveServiceLauncherMode().pipe(
    Effect.provideService(ServiceLauncherClient.ServiceLauncherHostProcess, host),
    Effect.provideService(HostProcessEnvironment, host.env),
  );

it.effect("reports a launcher-started child as managed", () =>
  Effect.gen(function* () {
    const host = new FakeLauncherProcess({
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      childVersion: "1.0.0",
    });
    const client = yield* makeClient(host, "1.0.0");
    expect(client.managed).toBe(true);
  }),
);

it.effect("treats a foreground server as unmanaged", () =>
  Effect.gen(function* () {
    const host = new FakeLauncherProcess();
    const client = yield* makeClient(host, "1.0.0");
    expect(client.managed).toBe(false);
  }),
);

it.effect("rejects a launcher context for another version", () =>
  Effect.gen(function* () {
    const host = new FakeLauncherProcess({
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      childVersion: "1.1.0",
    });
    const error = yield* makeClient(host, "1.0.0").pipe(Effect.flip);
    expect(error.message).toBe("The service launcher started a different t3 version.");
  }),
);

it.effect("rejects invalid launcher context instead of guessing", () =>
  Effect.gen(function* () {
    const host = new FakeLauncherProcess({
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      childVersion: "latest",
    });
    const error = yield* makeClient(host, "1.0.0").pipe(Effect.flip);
    expect(error.message).toBe("The service launcher supplied invalid startup context.");
  }),
);

it.effect("rejects a launcher context without an IPC channel", () =>
  Effect.gen(function* () {
    const host = new FakeLauncherProcess({
      protocol: SERVICE_LAUNCHER_PROTOCOL,
      childVersion: "1.0.0",
    });
    host.connected = false;
    const error = yield* makeClient(host, "1.0.0").pipe(Effect.flip);
    expect(error.message).toBe("The service launcher IPC channel is unavailable.");
  }),
);

it.effect("reports unmanaged mode for a foreground server", () =>
  Effect.gen(function* () {
    const host = new FakeLauncherProcess();
    expect(yield* makeMode(host)).toEqual({ managed: false });
  }),
);
