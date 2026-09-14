import { assert, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ClaudeProviderCapabilitiesV2 } from "./Adapters/ClaudeAdapterV2.ts";
import type { ProviderAdapterV2Shape } from "./ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderSwitch from "./ProviderSwitchService.ts";

const driver = ProviderDriverKind.make("claudeAgent");
const currentInstanceId = ProviderInstanceId.make("claude_primary");
const currentSessionId = ProviderSessionId.make("session_primary");
const now = DateTime.makeUnsafe("2026-06-20T00:00:00.000Z");
const capabilitiesWithoutModelSwitch = {
  ...ClaudeProviderCapabilitiesV2,
  sessions: {
    ...ClaudeProviderCapabilitiesV2.sessions,
    supportsModelSwitchInSession: false,
  },
};

function projection(): OrchestrationV2ThreadProjection {
  return {
    thread: {
      id: ThreadId.make("thread_switch_service"),
      modelSelection: { instanceId: currentInstanceId, model: "claude-sonnet-4-6" },
      runtimeMode: "full-access",
      interactionMode: "default",
      worktreePath: "/repo",
    },
    providerSessions: [
      {
        id: currentSessionId,
        providerInstanceId: currentInstanceId,
        status: "ready",
        cwd: "/repo",
        capabilities: capabilitiesWithoutModelSwitch,
        updatedAt: now,
      },
    ],
    providerThreads: [],
  } as unknown as OrchestrationV2ThreadProjection;
}

function testLayer(metadata: Readonly<Record<string, { continuationKey: string }>>) {
  const adapter = (instanceId: ProviderInstanceId): ProviderAdapterV2Shape => ({
    instanceId,
    driver,
    getCapabilities: () => Effect.succeed(capabilitiesWithoutModelSwitch),
    planSelectionTransition: () => Effect.succeed({ type: "restart_session" }),
    openSession: () => Effect.die("ProviderSwitchService tests do not open sessions."),
  });
  const registry = Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({
    get: (instanceId) =>
      metadata[instanceId] === undefined
        ? Effect.fail(
            new ProviderAdapterRegistry.ProviderAdapterRegistryLookupError({ instanceId }),
          )
        : Effect.succeed(adapter(instanceId)),
    list: () => Effect.succeed(Object.keys(metadata).map((id) => ProviderInstanceId.make(id))),
    getMetadata: (instanceId) => {
      const value = metadata[instanceId];
      return value === undefined
        ? Effect.fail(
            new ProviderAdapterRegistry.ProviderAdapterRegistryLookupError({ instanceId }),
          )
        : Effect.succeed({
            driver,
            continuationKey: value.continuationKey,
            enabled: true,
            capabilities: capabilitiesWithoutModelSwitch,
          });
    },
  });
  return ProviderSwitch.layer.pipe(Layer.provide(registry));
}

it.effect(
  "restarts and releases the current session for unsupported in-session model changes",
  () =>
    Effect.gen(function* () {
      const service = yield* ProviderSwitch.ProviderSwitchServiceV2;
      const result = yield* service.plan({
        projection: projection(),
        targetModelSelection: { instanceId: currentInstanceId, model: "claude-sonnet-4-6" },
      });
      assert.equal(result.transition.type, "restart_and_resume");
      assert.deepEqual(result.releaseProviderSessionIds, [currentSessionId]);
    }).pipe(
      Effect.provide(
        testLayer({ [currentInstanceId]: { continuationKey: "claude:account:primary" } }),
      ),
    ),
);

it.effect("distinguishes compatible and incompatible instances of the same driver", () =>
  Effect.gen(function* () {
    const service = yield* ProviderSwitch.ProviderSwitchServiceV2;
    const compatibleId = ProviderInstanceId.make("claude_compatible");
    const incompatibleId = ProviderInstanceId.make("claude_incompatible");
    const compatible = yield* service.plan({
      projection: projection(),
      targetModelSelection: { instanceId: compatibleId, model: "claude-sonnet-4-6" },
    });
    const incompatible = yield* service.plan({
      projection: projection(),
      targetModelSelection: { instanceId: incompatibleId, model: "claude-sonnet-4-6" },
    });
    assert.equal(compatible.transition.type, "restart_and_resume");
    assert.equal(incompatible.transition.type, "create_with_handoff");
  }).pipe(
    Effect.provide(
      testLayer({
        [currentInstanceId]: { continuationKey: "claude:account:primary" },
        claude_compatible: { continuationKey: "claude:account:primary" },
        claude_incompatible: { continuationKey: "claude:account:other" },
      }),
    ),
  ),
);
