import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ServerConfig,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveThreadProviderInstance } from "./thread-provider-instance";

function makeConfig(
  providers: ReadonlyArray<{
    readonly instanceId: string;
    readonly driver: string;
    readonly displayName?: string;
    readonly accentColor?: string;
  }>,
): ServerConfig {
  return { providers } as unknown as ServerConfig;
}

function makeThread(environmentId: EnvironmentId, instanceId: string): EnvironmentThreadShell {
  return {
    environmentId,
    id: ThreadId.make("thread-1"),
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make(instanceId), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  } as unknown as EnvironmentThreadShell;
}

describe("resolveThreadProviderInstance", () => {
  it("resolves two environments with the same default instance id independently", () => {
    const environmentA = EnvironmentId.make("environment-a");
    const environmentB = EnvironmentId.make("environment-b");
    const serverConfigs = new Map<EnvironmentId, ServerConfig>([
      [
        environmentA,
        makeConfig([{ instanceId: "claudeAgent", driver: "claudeAgent", accentColor: "#ff8800" }]),
      ],
      [environmentB, makeConfig([{ instanceId: "claudeAgent", driver: "claudeAgent" }])],
    ]);

    const threadA = makeThread(environmentA, "claudeAgent");
    const threadB = makeThread(environmentB, "claudeAgent");

    expect(resolveThreadProviderInstance(serverConfigs, threadA)?.accentColor).toBe("#ff8800");
    expect(resolveThreadProviderInstance(serverConfigs, threadB)?.accentColor).toBeUndefined();
  });

  it("labels a custom instance by its id so its initials differ from the default", () => {
    const environmentId = EnvironmentId.make("environment-a");
    const serverConfigs = new Map<EnvironmentId, ServerConfig>([
      [
        environmentId,
        makeConfig([
          { instanceId: "claudeAgent", driver: "claudeAgent", displayName: "Claude" },
          { instanceId: "claude_personal", driver: "claudeAgent", displayName: "Claude" },
        ]),
      ],
    ]);

    expect(
      resolveThreadProviderInstance(serverConfigs, makeThread(environmentId, "claudeAgent"))
        ?.displayName,
    ).toBe("Claude");
    expect(
      resolveThreadProviderInstance(serverConfigs, makeThread(environmentId, "claude_personal"))
        ?.displayName,
    ).toBe("Claude Personal");
  });

  it("uses the current runtime owner after a provider handoff", () => {
    const environmentId = EnvironmentId.make("environment-a");
    const serverConfigs = new Map<EnvironmentId, ServerConfig>([
      [
        environmentId,
        makeConfig([
          { instanceId: "claudeAgent", driver: "claudeAgent" },
          { instanceId: "claudeAgent", driver: "claudeAgent", displayName: "Claude" },
          { instanceId: "claude_work", driver: "claudeAgent", displayName: "Claude" },
        ]),
      ],
    ]);
    const thread = {
      ...makeThread(environmentId, "pi"),
      runtime: {
        status: "running" as const,
        activeRunId: null,
        providerInstanceId: ProviderInstanceId.make("claude_work"),
        providerName: "Claude",
        lastError: null,
        updatedAt: "2026-06-01T00:01:00.000Z",
      },
    };

    expect(resolveThreadProviderInstance(serverConfigs, thread)).toMatchObject({
      driverKind: "claudeAgent",
      displayName: "Claude Work",
      showBadge: true,
    });
  });

  it("hides the badge for a single instance with no accent color", () => {
    const environmentId = EnvironmentId.make("environment-a");
    const serverConfigs = new Map<EnvironmentId, ServerConfig>([
      [environmentId, makeConfig([{ instanceId: "claudeAgent", driver: "claudeAgent" }])],
    ]);
    const thread = makeThread(environmentId, "claudeAgent");

    expect(resolveThreadProviderInstance(serverConfigs, thread)?.showBadge).toBe(false);
  });
});
