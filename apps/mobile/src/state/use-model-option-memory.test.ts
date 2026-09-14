import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

import { appAtomRegistry } from "./atom-registry";
import { modelOptionMemoryAtom } from "./use-composer-drafts";
import {
  rememberModelOptions,
  rememberedModelOptions,
  withRememberedModelOptions,
} from "./use-model-option-memory";

const XHIGH = [{ id: "thinking", value: "xhigh" }] as const;
const HIGH = [{ id: "thinking", value: "high" }] as const;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  appAtomRegistry.set(modelOptionMemoryAtom, {});
});

describe("model option memory state", () => {
  it("records and looks up options per instance and model", () => {
    rememberModelOptions("claudeAgent", "claude-fable-5-1", [...XHIGH]);
    rememberModelOptions("claudeAgent", "claude-haiku-4-5", [...HIGH]);
    expect(rememberedModelOptions("claudeAgent", "claude-fable-5-1")).toEqual(XHIGH);
    expect(rememberedModelOptions("claudeAgent", "claude-haiku-4-5")).toEqual(HIGH);
    expect(rememberedModelOptions("pi", "claude-fable-5-1")).toBeUndefined();
  });

  it("ignores empty option sets when recording", () => {
    rememberModelOptions("claudeAgent", "claude-haiku-4-5", []);
    expect(rememberedModelOptions("claudeAgent", "claude-haiku-4-5")).toBeUndefined();
  });
});

describe("withRememberedModelOptions", () => {
  it("restores the remembered options over descriptor defaults", () => {
    rememberModelOptions("claudeAgent", "claude-fable-5-1", [...XHIGH]);
    expect(
      withRememberedModelOptions({
        instanceId: "claudeAgent",
        model: "claude-fable-5-1",
        options: [{ id: "reasoningEffort", value: "low" }],
      }),
    ).toEqual({ instanceId: "claudeAgent", model: "claude-fable-5-1", options: XHIGH });
  });

  it("keeps incoming selections that already match memory", () => {
    rememberModelOptions("pi", "xai/grok-4.6", [...XHIGH]);
    const selection = { instanceId: "pi", model: "xai/grok-4.6", options: [...XHIGH] };
    expect(withRememberedModelOptions(selection)).toBe(selection);
  });

  it("keeps incoming selections when nothing is remembered", () => {
    const selection = { instanceId: "pi", model: "openai/gpt-5.6-sol" };
    expect(withRememberedModelOptions(selection)).toBe(selection);
  });
});
