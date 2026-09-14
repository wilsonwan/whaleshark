import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  ProviderDriverKind,
  ProviderInstanceConfig,
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  ProviderInstanceRef,
} from "./providerInstance.ts";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);
const decodeProviderInstanceRef = Schema.decodeUnknownSync(ProviderInstanceRef);
const decodeProviderInstanceConfig = Schema.decodeUnknownSync(ProviderInstanceConfig);
const decodeProviderInstanceConfigMap = Schema.decodeUnknownSync(ProviderInstanceConfigMap);

describe("provider slug validation (shared by driver + instance ids)", () => {
  const cases = [
    { schemaName: "ProviderInstanceId", decode: decodeProviderInstanceId },
    { schemaName: "ProviderDriverKind", decode: decodeProviderDriverKind },
  ] as const;

  for (const { schemaName, decode } of cases) {
    describe(schemaName, () => {
      it.each(["claudeAgent", "claude_personal", "claude-work", "pi", "x", "abc123", "ollama"])(
        "accepts %s",
        (id) => {
          expect(decode(id)).toBe(id);
        },
      );

      it.each([
        ["empty string", ""],
        ["leading digit", "1claude"],
        ["leading dash", "-claude"],
        ["leading underscore", "_claude"],
        ["whitespace inside", "claude personal"],
        ["dot inside", "claude.personal"],
        ["slash inside", "claude/personal"],
      ])("rejects %s", (_label, value) => {
        expect(() => decode(value)).toThrow();
      });

      it("trims surrounding whitespace before validating", () => {
        expect(decode("  claude_work  ")).toBe("claude_work");
      });

      it("rejects ids longer than 64 characters", () => {
        const tooLong = "a".repeat(65);
        expect(() => decode(tooLong)).toThrow();
        const justRight = "a".repeat(64);
        expect(decode(justRight)).toBe(justRight);
      });
    });
  }
});

describe("ProviderInstanceRef", () => {
  it("decodes a driver ref", () => {
    const ref = decodeProviderInstanceRef({
      instanceId: "claude_work",
      driver: "claudeAgent",
    });
    expect(ref.instanceId).toBe("claude_work");
    expect(ref.driver).toBe("claudeAgent");
  });

  it("decodes a fork-defined driver ref without complaint", () => {
    const ref = decodeProviderInstanceRef({
      instanceId: "ollama_local",
      driver: "ollama",
    });
    expect(ref.instanceId).toBe("ollama_local");
    expect(ref.driver).toBe("ollama");
  });

  it("rejects refs whose driver field is not a valid slug", () => {
    expect(() =>
      decodeProviderInstanceRef({
        instanceId: "claudeAgent",
        driver: "1nope",
      }),
    ).toThrow();
  });
});

describe("ProviderInstanceConfig", () => {
  it("accepts a minimal config envelope for a driver", () => {
    const decoded = decodeProviderInstanceConfig({ driver: "claudeAgent" });
    expect(decoded.driver).toBe("claudeAgent");
    expect(decoded.displayName).toBeUndefined();
    expect(decoded.enabled).toBeUndefined();
    expect(decoded.config).toBeUndefined();
  });

  it("preserves driver-opaque config payloads verbatim", () => {
    const opaqueConfig = { homePath: "~/.claude_personal", binaryPath: "claude" };
    const decoded = decodeProviderInstanceConfig({
      driver: "claudeAgent",
      displayName: "Claude (personal)",
      accentColor: "#dc2626",
      enabled: true,
      config: opaqueConfig,
    });
    expect(decoded.displayName).toBe("Claude (personal)");
    expect(decoded.accentColor).toBe("#dc2626");
    expect(decoded.enabled).toBe(true);
    expect(decoded.config).toEqual(opaqueConfig);
  });

  it("trims provider instance envelope fields", () => {
    const decoded = decodeProviderInstanceConfig({
      driver: "  claudeAgent  ",
      displayName: "  Claude Personal  ",
      accentColor: "  #dc2626  ",
      environment: [{ name: "  OPENROUTER_API_KEY  ", value: "  sk-or-test  " }],
    });

    expect(decoded).toMatchObject({
      driver: "claudeAgent",
      displayName: "Claude Personal",
      accentColor: "#dc2626",
      environment: [{ name: "OPENROUTER_API_KEY", value: "  sk-or-test  " }],
    });
  });

  it("decodes generic environment variables on the instance envelope", () => {
    const decoded = decodeProviderInstanceConfig({
      driver: "claudeAgent",
      environment: [
        { name: "ANTHROPIC_BASE_URL", value: "https://openrouter.ai/api", sensitive: false },
        { name: "OPENROUTER_API_KEY", value: "sk-or-test", sensitive: true },
        { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
      ],
    });

    expect(decoded.environment).toEqual([
      { name: "ANTHROPIC_BASE_URL", value: "https://openrouter.ai/api", sensitive: false },
      { name: "OPENROUTER_API_KEY", value: "sk-or-test", sensitive: true },
      { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
    ]);
  });

  it("rejects invalid environment variable names", () => {
    expect(() =>
      decodeProviderInstanceConfig({
        driver: "claudeAgent",
        environment: [{ name: "HAS-DASH", value: "x", sensitive: false }],
      }),
    ).toThrow();
  });

  it("decodes envelopes that name an unknown driver and preserves their config opaquely", () => {
    const opaqueConfig = { someUnknownKnob: 42, model: "llama3" };
    const decoded = decodeProviderInstanceConfig({
      driver: "ollama",
      displayName: "Ollama",
      enabled: true,
      config: opaqueConfig,
    });
    expect(decoded.driver).toBe("ollama");
    expect(decoded.config).toEqual(opaqueConfig);
  });

  it("rejects a blank displayName (must be trimmed non-empty)", () => {
    expect(() =>
      decodeProviderInstanceConfig({ driver: "claudeAgent", displayName: "   " }),
    ).toThrow();
  });

  it("rejects driver values that do not satisfy the slug pattern", () => {
    expect(() => decodeProviderInstanceConfig({ driver: "" })).toThrow();
    expect(() => decodeProviderInstanceConfig({ driver: "has spaces" })).toThrow();
  });
});

describe("ProviderInstanceConfigMap", () => {
  it("decodes a multi-instance map mixing first-party and fork drivers", () => {
    const decoded = decodeProviderInstanceConfigMap({
      claude_personal: {
        driver: "claudeAgent",
        displayName: "Claude (personal)",
        config: { homePath: "~/.claude_personal" },
      },
      claude_work: {
        driver: "claudeAgent",
        config: { homePath: "~/.claude_work" },
      },
      claudeAgent: { driver: "claudeAgent" },
      ollama_local: { driver: "ollama", config: { endpoint: "http://localhost:11434" } },
    });
    expect(new Set(Object.keys(decoded))).toEqual(
      new Set(["claudeAgent", "claude_personal", "claude_work", "ollama_local"]),
    );
    expect(decoded[ProviderInstanceId.make("claude_personal")]?.driver).toBe("claudeAgent");
    expect(decoded[ProviderInstanceId.make("claude_work")]?.config).toEqual({
      homePath: "~/.claude_work",
    });
    expect(decoded[ProviderInstanceId.make("ollama_local")]?.driver).toBe("ollama");
  });

  it("rejects keys that fail the instance-id pattern", () => {
    expect(() =>
      decodeProviderInstanceConfigMap({
        "1claude": { driver: "claudeAgent" },
      }),
    ).toThrow();
  });
});
