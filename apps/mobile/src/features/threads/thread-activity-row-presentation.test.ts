import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveThreadActivityMetadata,
  resolveThreadActivityStatus,
} from "./thread-activity-row-presentation";

describe("thread activity row presentation", () => {
  it("shows the provider and model as compact metadata", () => {
    expect(
      resolveThreadActivityMetadata({
        providerDriver: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        model: "claude-fable-5-1",
      }),
    ).toBe("Claude · claude-fable-5-1");
  });

  it("falls back to the provider instance and removes duplicate metadata", () => {
    expect(
      resolveThreadActivityMetadata({
        providerDriver: null,
        providerInstanceId: ProviderInstanceId.make("custom-agent"),
        model: "custom-agent",
      }),
    ).toBe("custom-agent");
  });

  it("maps lifecycle status to dot tone and an accessible label", () => {
    expect(resolveThreadActivityStatus("idle")).toEqual({ label: "Idle", tone: "neutral" });
    expect(resolveThreadActivityStatus("running")).toEqual({ label: "Running", tone: "active" });
    expect(resolveThreadActivityStatus("completed")).toEqual({
      label: "Completed",
      tone: "success",
    });
    expect(resolveThreadActivityStatus("failed")).toEqual({ label: "Failed", tone: "danger" });
    expect(resolveThreadActivityStatus("interrupted")).toEqual({
      label: "Interrupted",
      tone: "warning",
    });
  });
});
