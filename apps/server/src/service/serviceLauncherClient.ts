import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import packageJson from "../../package.json" with { type: "json" };
import { decodeServiceLauncherContext, SERVICE_LAUNCHER_CONTEXT_ENV } from "./serviceProtocol.ts";

export class ServiceLauncherClientError extends Schema.TaggedError<ServiceLauncherClientError>()(
  "ServiceLauncherClientError",
  {
    operation: Schema.Literals(["decode-context", "version-mismatch", "ipc-unavailable"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.operation) {
      case "decode-context":
        return "The service launcher supplied invalid startup context.";
      case "version-mismatch":
        return "The service launcher started a different t3 version.";
      case "ipc-unavailable":
        return "The service launcher IPC channel is unavailable.";
    }
  }
}

interface ServiceLauncherProcess {
  readonly connected: boolean;
}

export const ServiceLauncherHostProcess = Context.Reference<ServiceLauncherProcess>(
  "t3/service/serviceLauncherHostProcess",
  {
    defaultValue: () => ({
      connected: process.connected && process.send !== undefined,
    }),
  },
);

/**
 * The launcher only launches: the child reports whether it was started by the
 * launcher and refuses to keep running if the launcher started another version.
 */
export class ServiceLauncherClient extends Context.Service<
  ServiceLauncherClient,
  {
    readonly managed: boolean;
  }
>()("t3/service/serviceLauncherClient") {}

const resolveStartup = Effect.fn("cloud.service_launcher_client.resolve_startup")(
  function* (options?: { readonly currentVersion?: string }) {
    const host = yield* ServiceLauncherHostProcess;
    const environment = yield* HostProcessEnvironment;
    const currentVersion = options?.currentVersion ?? packageJson.version;
    const rawContext = environment[SERVICE_LAUNCHER_CONTEXT_ENV];
    const context = rawContext === undefined ? undefined : decodeServiceLauncherContext(rawContext);

    if (rawContext !== undefined && context === undefined) {
      return yield* new ServiceLauncherClientError({ operation: "decode-context" });
    }
    if (context !== undefined && context.childVersion !== currentVersion) {
      return yield* new ServiceLauncherClientError({ operation: "version-mismatch" });
    }
    if (context !== undefined && !host.connected) {
      return yield* new ServiceLauncherClientError({ operation: "ipc-unavailable" });
    }

    return { managed: context !== undefined && host.connected };
  },
);

export const resolveServiceLauncherMode = Effect.fn("cloud.service_launcher_client.resolve_mode")(
  function* () {
    const { managed } = yield* resolveStartup();
    return { managed };
  },
);

export const make = Effect.fn("cloud.service_launcher_client.make")(function* (options?: {
  readonly currentVersion?: string;
}) {
  const { managed } = yield* resolveStartup(options);
  return ServiceLauncherClient.of({ managed });
});

export const layer = Layer.effect(ServiceLauncherClient, make());
