import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  normalizeProviderAccentColor,
  providerInstanceInitials,
  resolveProviderInstanceDisplayName,
  shouldShowInstanceBadge,
} from "./providerInstanceDisplay.ts";

const pi = ProviderDriverKind.make("pi");
const claude = ProviderDriverKind.make("claudeAgent");

describe("resolveProviderInstanceDisplayName", () => {
  it("keeps a snapshot name that differs from the brand label", () => {
    expect(
      resolveProviderInstanceDisplayName({
        instanceId: ProviderInstanceId.make("pi"),
        driver: pi,
        displayName: "Work",
      }),
    ).toBe("Work");
  });

  it("humanizes a custom instance id when the snapshot only carries the brand label", () => {
    expect(
      resolveProviderInstanceDisplayName({
        instanceId: ProviderInstanceId.make("pi_personal"),
        driver: pi,
        displayName: "Pi",
      }),
    ).toBe("Pi Personal");
  });

  it("uses the brand label for the default instance", () => {
    expect(
      resolveProviderInstanceDisplayName({
        instanceId: ProviderInstanceId.make("pi"),
        driver: pi,
      }),
    ).toBe("Pi");
  });
});

describe("providerInstanceInitials", () => {
  it("takes the first two characters of a single word", () => {
    expect(providerInstanceInitials("Pi")).toBe("PI");
  });

  it("takes the first character of each of the first two words", () => {
    expect(providerInstanceInitials("Pi Personal")).toBe("PP");
  });

  it("ignores words past the first two", () => {
    expect(providerInstanceInitials("Pi Personal Backup Account")).toBe("PP");
  });

  it("returns an empty string for an empty label", () => {
    expect(providerInstanceInitials("")).toBe("");
  });

  it("keeps an emoji whole instead of splitting its surrogate pair", () => {
    expect(providerInstanceInitials("😀 Work")).toBe("😀W");
    expect(providerInstanceInitials("😀")).toBe("😀");
  });
});

describe("normalizeProviderAccentColor", () => {
  it("accepts a lowercase hex color", () => {
    expect(normalizeProviderAccentColor("#ff8800")).toBe("#ff8800");
  });

  it("accepts an uppercase hex color", () => {
    expect(normalizeProviderAccentColor("#FF8800")).toBe("#FF8800");
  });

  it("rejects a non-hex value", () => {
    expect(normalizeProviderAccentColor("blue")).toBeUndefined();
  });

  it("rejects a short hex value", () => {
    expect(normalizeProviderAccentColor("#fff")).toBeUndefined();
  });

  it("treats undefined and blank as unset", () => {
    expect(normalizeProviderAccentColor(undefined)).toBeUndefined();
    expect(normalizeProviderAccentColor("   ")).toBeUndefined();
  });
});

describe("shouldShowInstanceBadge", () => {
  it("shows the badge when the entry has an accent color", () => {
    const entry = { driverKind: pi, accentColor: "#ff8800" };
    expect(shouldShowInstanceBadge(entry, [entry])).toBe(true);
  });

  it("shows the badge when two entries share a driver, even without an accent", () => {
    const first = { driverKind: pi, accentColor: undefined };
    const second = { driverKind: pi, accentColor: undefined };
    expect(shouldShowInstanceBadge(first, [first, second])).toBe(true);
  });

  it("hides the badge for a single instance of a driver with no accent", () => {
    const entry = { driverKind: pi, accentColor: undefined };
    const other = { driverKind: claude, accentColor: undefined };
    expect(shouldShowInstanceBadge(entry, [entry, other])).toBe(false);
  });
});
