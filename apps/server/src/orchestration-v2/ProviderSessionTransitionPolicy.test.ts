import { assert, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";

import { TestProviderCapabilitiesV2 } from "./testProviderCapabilities.ts";
import { decideProviderSessionTransition } from "./ProviderSessionTransitionPolicy.ts";

const driver = ProviderDriverKind.make("opencode");
const instanceId = ProviderInstanceId.make("opencode");
const base = {
  driver,
  continuationIdentity: { driverKind: driver, continuationKey: "opencode:account:one" },
  modelSelection: { instanceId, model: "opencode-model-a" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  workspace: "/repo",
  capabilities: TestProviderCapabilitiesV2,
};

it("reuses compatible sessions and treats interaction mode as turn-scoped", () => {
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target: { ...base, interactionMode: "plan", available: true },
    }),
    { type: "reuse" },
  );
});

it("uses the adapter's selection transition classification", () => {
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target: {
        ...base,
        modelSelection: { ...base.modelSelection, model: "opencode-model-b" },
        available: true,
      },
      selectionTransition: { type: "apply_on_next_turn" },
    }),
    { type: "switch_model_in_session" },
  );
  assert.deepEqual(
    decideProviderSessionTransition({
      current: {
        ...base,
        capabilities: {
          ...base.capabilities,
          sessions: { ...base.capabilities.sessions, supportsModelSwitchInSession: false },
        },
      },
      target: {
        ...base,
        capabilities: {
          ...base.capabilities,
          sessions: { ...base.capabilities.sessions, supportsModelSwitchInSession: false },
        },
        modelSelection: { ...base.modelSelection, model: "opencode-model-b" },
        available: true,
      },
      selectionTransition: { type: "restart_session" },
    }),
    { type: "restart_and_resume" },
  );
});

it("treats provider option changes as selection changes", () => {
  assert.deepEqual(
    decideProviderSessionTransition({
      current: {
        ...base,
        modelSelection: {
          ...base.modelSelection,
          options: [{ id: "reasoningEffort", value: "medium" }],
        },
      },
      target: {
        ...base,
        modelSelection: {
          ...base.modelSelection,
          options: [{ id: "reasoningEffort", value: "high" }],
        },
        available: true,
      },
      selectionTransition: { type: "apply_on_next_turn" },
    }),
    { type: "switch_model_in_session" },
  );
});

it("restarts compatible instances for workspace or runtime changes", () => {
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target: { ...base, workspace: "/other", available: true },
    }),
    { type: "restart_and_resume" },
  );
});

it("preserves a rejected selection when the workspace also changes", () => {
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target: {
        ...base,
        modelSelection: { ...base.modelSelection, model: "opencode-model-b" },
        workspace: "/other",
        available: true,
      },
      selectionTransition: {
        type: "reject",
        reason: "The active session cannot apply that model.",
      },
    }),
    { type: "reject", reason: "The active session cannot apply that model." },
  );
});

it("preserves handoff and missing-classification outcomes across workspace changes", () => {
  const target = {
    ...base,
    modelSelection: { ...base.modelSelection, model: "opencode-model-b" },
    workspace: "/other",
    available: true,
  };
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target,
      selectionTransition: { type: "create_with_handoff" },
    }),
    { type: "create_with_handoff" },
  );
  assert.deepEqual(decideProviderSessionTransition({ current: base, target }), {
    type: "reject",
    reason: "The provider adapter did not classify the selection change.",
  });
});

it("uses portable handoff for incompatible continuation identities", () => {
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target: {
        ...base,
        modelSelection: {
          ...base.modelSelection,
          instanceId: ProviderInstanceId.make("opencode_other"),
        },
        continuationIdentity: { driverKind: driver, continuationKey: "opencode:account:other" },
        available: true,
      },
    }),
    { type: "create_with_handoff" },
  );
});

it("uses portable handoff for cross-driver transitions", () => {
  const acpDriver = ProviderDriverKind.make("acpRegistry");
  assert.deepEqual(
    decideProviderSessionTransition({
      current: base,
      target: {
        ...base,
        driver: acpDriver,
        continuationIdentity: { driverKind: acpDriver, continuationKey: "acpRegistry:account:one" },
        modelSelection: {
          instanceId: ProviderInstanceId.make("acpRegistry"),
          model: "anthropic/claude-sonnet",
        },
        available: true,
      },
    }),
    { type: "create_with_handoff" },
  );
});
