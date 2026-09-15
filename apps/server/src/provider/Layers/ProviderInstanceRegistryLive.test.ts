/**
 * Multi-instance validation for the concrete drivers that remain registered.
 *
 * The registry must build one independent bundle per configured instance and
 * preserve the instance identity in the snapshot and continuation key.
 */
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  type OpenCodeSettings,
  type PiSettings,
  ProviderDriverKind,
  type ProviderInstanceConfigMap,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import * as BackgroundPolicy from "../../background/BackgroundPolicy.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { OpenCodeDriver, type OpenCodeDriverEnv } from "../Drivers/OpenCodeDriver.ts";
import { PiDriver, type PiDriverEnv } from "../Drivers/PiDriver.ts";
import * as ModelManifest from "../ModelManifest.ts";
import { OpenCodeRuntimeLive } from "../opencodeRuntime.ts";
import { NoOpProviderEventLoggers, ProviderEventLoggers } from "./ProviderEventLoggers.ts";
import { makeProviderInstanceRegistry } from "./ProviderInstanceRegistryLive.ts";
import { ProviderOrchestrationAdapterInfrastructureLive } from "./ProviderOrchestrationAdapterInfrastructure.ts";

const TEST_EPOCH = DateTime.makeUnsafe("1970-01-01T00:00:00.000Z");

const TestHttpClientLive = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ version: "0.0.0" }))),
  ),
);

const BackgroundPolicyAlwaysRunLayer = Layer.mock(BackgroundPolicy.BackgroundPolicy)({
  reportClientActivity: () => Effect.void,
  removeRpcClient: () => Effect.void,
  reportHostPowerState: () => Effect.void,
  snapshot: Effect.succeed({
    hostPower: {
      source: "unknown",
      idle: "unknown",
      idleSeconds: null,
      locked: "unknown",
      suspended: false,
      onBattery: "unknown",
      lowPowerMode: "unknown",
      thermalState: "unknown",
      stale: true,
      updatedAt: TEST_EPOCH,
    },
    leases: [],
    activeForegroundLeaseCount: 0,
    activeScopeKeys: [],
    shouldRunOpportunisticWork: true,
    updatedAt: TEST_EPOCH,
  }),
  streamChanges: Stream.empty,
  hasDemand: () => Effect.succeed(true),
  shouldRunScopeWork: () => Effect.succeed(true),
  shouldRunOpportunisticWork: Effect.succeed(true),
});

const makePiConfig = (overrides: Partial<PiSettings> = {}): PiSettings => ({
  enabled: false,
  binaryPath: "pi",
  launchArgs: "",
  customModels: [],
  ...overrides,
});

const makeOpenCodeConfig = (overrides: Partial<OpenCodeSettings> = {}): OpenCodeSettings => ({
  enabled: false,
  binaryPath: "opencode",
  serverUrl: "",
  serverPassword: "",
  customModels: [],
  ...overrides,
});

const serverConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "provider-instance-registry-surviving-drivers-test",
});
const infraLayer = OpenCodeRuntimeLive.pipe(Layer.provideMerge(NodeServices.layer));
const baseLayer = serverConfigLayer.pipe(
  Layer.provideMerge(infraLayer),
  Layer.provideMerge(BackgroundPolicyAlwaysRunLayer),
  Layer.provideMerge(ServerSettingsService.layerTest()),
  Layer.provideMerge(TestHttpClientLive),
  Layer.provideMerge(Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers)),
  Layer.provideMerge(ModelManifest.layerTest),
);
const testLayer = ProviderOrchestrationAdapterInfrastructureLive.pipe(
  Layer.provideMerge(baseLayer),
);

describe("ProviderInstanceRegistryLive — surviving drivers", () => {
  it.live("boots independent Pi and OpenCode instances from one config map", () =>
    Effect.gen(function* () {
      const piId = ProviderInstanceId.make("pi_default");
      const openCodeId = ProviderInstanceId.make("opencode_default");
      const piDriver = ProviderDriverKind.make("pi");
      const openCodeDriver = ProviderDriverKind.make("opencode");
      const configMap: ProviderInstanceConfigMap = {
        [piId]: {
          driver: piDriver,
          displayName: "Pi",
          enabled: false,
          config: makePiConfig(),
        },
        [openCodeId]: {
          driver: openCodeDriver,
          displayName: "OpenCode",
          enabled: false,
          config: makeOpenCodeConfig(),
        },
      };

      const { registry } = yield* makeProviderInstanceRegistry<PiDriverEnv | OpenCodeDriverEnv>({
        drivers: [PiDriver, OpenCodeDriver],
        configMap,
      });

      expect(yield* registry.listUnavailable).toEqual([]);
      const instances = yield* registry.listInstances;
      expect(instances).toHaveLength(2);
      expect(instances.map((instance) => instance.instanceId).toSorted()).toEqual(
        [piId, openCodeId].toSorted(),
      );

      const pi = yield* registry.getInstance(piId);
      const openCode = yield* registry.getInstance(openCodeId);
      expect(pi?.driverKind).toBe(piDriver);
      expect(openCode?.driverKind).toBe(openCodeDriver);
      expect(pi?.displayName).toBe("Pi");
      expect(openCode?.displayName).toBe("OpenCode");
      expect(pi?.orchestrationAdapter).not.toBe(openCode?.orchestrationAdapter);
      expect(pi?.textGeneration).not.toBe(openCode?.textGeneration);
      expect(pi?.snapshot).not.toBe(openCode?.snapshot);

      const piSnapshot = yield* pi!.snapshot.getSnapshot;
      expect(piSnapshot).toMatchObject({
        instanceId: piId,
        driver: piDriver,
        enabled: false,
      });
      expect(piSnapshot.continuation?.groupKey).toBe(`${piDriver}:instance:${piId}`);

      const openCodeSnapshot = yield* openCode!.snapshot.getSnapshot;
      expect(openCodeSnapshot).toMatchObject({
        instanceId: openCodeId,
        driver: openCodeDriver,
        enabled: false,
      });
      expect(openCodeSnapshot.continuation?.groupKey).toBe(
        `${openCodeDriver}:instance:${openCodeId}`,
      );
    }).pipe(Effect.provide(testLayer)),
  );
});
