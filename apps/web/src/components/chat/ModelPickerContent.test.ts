import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  resolveModelPickerSelectedModel,
  shouldIncludeModelPickerOption,
  shouldOfferModelPickerSetup,
} from "./ModelPickerContent";

function entry(status: ServerProvider["status"], driver = "opencode") {
  return deriveProviderInstanceEntries([
    {
      instanceId: ProviderInstanceId.make(`${driver}_work`),
      driver: ProviderDriverKind.make(driver),
      enabled: true,
      installed: true,
      version: null,
      status,
      auth: { status: "authenticated" },
      checkedAt: "2026-08-28T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ])[0]!;
}

describe("shouldIncludeModelPickerOption", () => {
  it.each(["claudeAgent", "pi", "acpRegistry"] as const)(
    "never offers an unavailable saved model while the %s instance is not ready",
    (driver) => {
      const providerEntry = entry("error", driver);
      expect(
        shouldIncludeModelPickerOption({
          entry: providerEntry,
          option: { slug: "stale/model", name: "Stale model", isUnavailable: true },
          activeInstanceId: providerEntry.instanceId,
          activeModel: "stale/model",
        }),
      ).toBe(false);
    },
  );

  it("offers every catalog model while the provider instance is ready", () => {
    const providerEntry = entry("ready", "claudeAgent");
    expect(
      shouldIncludeModelPickerOption({
        entry: providerEntry,
        option: { slug: "gpt-5", name: "GPT 5", isUnavailable: true },
        activeInstanceId: ProviderInstanceId.make("claude_personal"),
        activeModel: "gpt-5",
      }),
    ).toBe(true);
  });

  it.each(["error", "warning"] as const)(
    "keeps only the active synthetic OpenCode row when the provider status is %s",
    (status) => {
      const providerEntry = entry(status, "opencode");
      const activeInstanceId = providerEntry.instanceId;
      const activeModel = "missing-model";

      expect(
        shouldIncludeModelPickerOption({
          entry: providerEntry,
          option: {
            slug: activeModel,
            name: activeModel,
            isUnavailable: true,
          },
          activeInstanceId,
          activeModel,
        }),
      ).toBe(true);
      expect(
        shouldIncludeModelPickerOption({
          entry: providerEntry,
          option: { slug: "stale/model", name: "Stale model" },
          activeInstanceId,
          activeModel,
        }),
      ).toBe(false);
      expect(
        shouldIncludeModelPickerOption({
          entry: providerEntry,
          option: {
            slug: "other/missing",
            name: "Other missing",
            isUnavailable: true,
          },
          activeInstanceId,
          activeModel,
        }),
      ).toBe(false);
      expect(
        shouldIncludeModelPickerOption({
          entry: providerEntry,
          option: { slug: activeModel, name: activeModel, isUnavailable: true },
          activeInstanceId: ProviderInstanceId.make("opencode_personal"),
          activeModel,
        }),
      ).toBe(false);
    },
  );
});

describe("resolveModelPickerSelectedModel", () => {
  it("matches the stored model against the catalog by slug", () => {
    const options = [
      { slug: "gpt-5", name: "GPT 5" },
      { slug: "gpt-5-mini", name: "GPT 5 Mini" },
    ];

    expect(
      resolveModelPickerSelectedModel({
        driverKind: ProviderDriverKind.make("claudeAgent"),
        model: "gpt-5-mini",
        options,
      })?.slug,
    ).toBe("gpt-5-mini");
    expect(
      resolveModelPickerSelectedModel({
        driverKind: ProviderDriverKind.make("claudeAgent"),
        model: "gpt-5",
        options,
      })?.slug,
    ).toBe("gpt-5");
  });

  it("does not guess the default from the first model in a catalog", () => {
    expect(
      resolveModelPickerSelectedModel({
        driverKind: ProviderDriverKind.make("claudeAgent"),
        model: "claude-opus-4-6",
        options: [{ slug: "gpt-5", name: "GPT 5" }],
      }),
    ).toBeUndefined();
  });
});

describe("shouldOfferModelPickerSetup", () => {
  const availableModel = { slug: "gpt-5", name: "GPT 5" };

  it("offers setup while a provider with environment setup has no catalog yet", () => {
    const providerEntry = entry("error", "acpRegistry");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
          },
        },
        [],
      ),
    ).toBe(true);
  });

  it("offers setup after sign-out even if a model remains cached", () => {
    const providerEntry = entry("ready", "acpRegistry");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
            auth: { status: "unauthenticated" },
          },
        },
        [availableModel],
      ),
    ).toBe(true);
  });

  it("offers setup when the only model is an unavailable saved selection", () => {
    const providerEntry = entry("ready", "acpRegistry");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
          },
        },
        [{ ...availableModel, isUnavailable: true }],
      ),
    ).toBe(true);
  });

  it("does not offer setup for a ready account with available models", () => {
    const providerEntry = entry("ready", "acpRegistry");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
          },
        },
        [availableModel],
      ),
    ).toBe(false);
  });

  it("does not restore a disabled provider while its status snapshot is stale", () => {
    const providerEntry = entry("error", "acpRegistry");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          enabled: false,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
          },
        },
        [],
      ),
    ).toBe(false);
  });

  it("keeps providers without integrated setup on their existing path", () => {
    expect(shouldOfferModelPickerSetup(entry("error", "claudeAgent"), [])).toBe(false);
  });

  it("uses the environment's setup capability for other drivers", () => {
    const providerEntry = entry("error", "custom_driver");
    expect(
      shouldOfferModelPickerSetup(
        {
          ...providerEntry,
          snapshot: {
            ...providerEntry.snapshot,
            setup: { canAuthenticate: true, canInstall: false },
          },
        },
        [],
      ),
    ).toBe(true);
  });
});
