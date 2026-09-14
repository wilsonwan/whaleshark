import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  getOnboardingProviderState,
  resolveOnboardingProviderInstallCommand,
  resolveOnboardingProviderLoginCommand,
  selectOnboardingProvidersByDriver,
} from "./providerReadiness.logic";

const readyClaude: ServerProvider = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  driver: ProviderDriverKind.make("claudeAgent"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "unknown" },
  checkedAt: "2026-08-23T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};

describe("getOnboardingProviderState", () => {
  it("treats an enabled Claude provider with ready status and unknown authentication as ready", () => {
    expect(getOnboardingProviderState(readyClaude)).toBe("ready");
  });

  it("treats authenticated providers as ready only when their provider status is ready", () => {
    expect(getOnboardingProviderState({ ...readyClaude, auth: { status: "authenticated" } })).toBe(
      "ready",
    );
    expect(
      getOnboardingProviderState({
        ...readyClaude,
        auth: { status: "authenticated" },
        status: "error",
      }),
    ).toBe("attention");
    expect(
      getOnboardingProviderState({
        ...readyClaude,
        auth: { status: "authenticated" },
        status: "warning",
      }),
    ).toBe("attention");
  });

  it("offers sign-in only when the server reports an authentication failure", () => {
    expect(
      getOnboardingProviderState({
        ...readyClaude,
        status: "error",
        auth: { status: "unauthenticated" },
      }),
    ).toBe("signIn");
    expect(getOnboardingProviderState({ ...readyClaude, status: "error" })).toBe("attention");
    expect(getOnboardingProviderState({ ...readyClaude, status: "warning" })).toBe("attention");
  });

  it("does not offer installation or sign-in for disabled providers", () => {
    expect(getOnboardingProviderState({ ...readyClaude, enabled: false, installed: false })).toBe(
      "disabled",
    );
    expect(getOnboardingProviderState({ ...readyClaude, status: "disabled" })).toBe("disabled");
  });

  it("offers installation only when an enabled provider is missing", () => {
    expect(getOnboardingProviderState({ ...readyClaude, installed: false, status: "error" })).toBe(
      "install",
    );
  });

  it("waits for a provider snapshot before offering an action", () => {
    expect(getOnboardingProviderState(undefined)).toBe("checking");
  });
});

describe("selectOnboardingProvidersByDriver", () => {
  it("prefers a ready instance with unknown authentication to an unauthenticated instance", () => {
    const signedOutClaude: ServerProvider = {
      ...readyClaude,
      instanceId: ProviderInstanceId.make("claude_work"),
      status: "error",
      auth: { status: "unauthenticated" },
    };

    expect(
      selectOnboardingProvidersByDriver([signedOutClaude, readyClaude]).get("claudeAgent"),
    ).toBe(readyClaude);
  });

  it("prefers a provider with an actionable sign-in over a failed provider", () => {
    const failedClaude: ServerProvider = { ...readyClaude, status: "error" };
    const signedOutClaude: ServerProvider = {
      ...readyClaude,
      instanceId: ProviderInstanceId.make("claude_work"),
      status: "error",
      auth: { status: "unauthenticated" },
    };

    expect(
      selectOnboardingProvidersByDriver([failedClaude, signedOutClaude]).get("claudeAgent"),
    ).toBe(signedOutClaude);
  });

  it("prefers installed providers over missing or disabled instances", () => {
    const disabledClaude: ServerProvider = { ...readyClaude, enabled: false };
    const missingClaude: ServerProvider = {
      ...readyClaude,
      instanceId: ProviderInstanceId.make("claude_work"),
      installed: false,
      status: "error",
    };

    expect(
      selectOnboardingProvidersByDriver([disabledClaude, missingClaude, readyClaude]).get(
        "claudeAgent",
      ),
    ).toBe(readyClaude);
  });

  it("handles provider snapshots that have not arrived", () => {
    expect(selectOnboardingProvidersByDriver(undefined).size).toBe(0);
  });

  it("keeps a ready custom account when the default account is signed out", () => {
    const signedOutDefault: ServerProvider = {
      ...readyClaude,
      status: "error",
      auth: { status: "unauthenticated" },
    };
    const readyCustom: ServerProvider = {
      ...readyClaude,
      instanceId: ProviderInstanceId.make("claude_work"),
    };

    expect(
      selectOnboardingProvidersByDriver([signedOutDefault, readyCustom]).get("claudeAgent"),
    ).toBe(readyCustom);
  });
});

describe("resolveOnboardingProviderLoginCommand", () => {
  it("uses the selected Claude account binary", () => {
    const provider: ServerProvider = {
      ...readyClaude,
      driver: ProviderDriverKind.make("claudeAgent"),
      instanceId: ProviderInstanceId.make("claude_work"),
    };

    expect(
      resolveOnboardingProviderLoginCommand(
        provider,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providerInstances: {
            [provider.instanceId]: {
              driver: provider.driver,
              config: { binaryPath: "/opt/claude-work/bin/claude" },
            },
          },
        },
        "linux",
      ),
    ).toBe("/opt/claude-work/bin/claude auth login");
  });

  it("quotes a Claude path with spaces for PowerShell", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        readyClaude,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            claudeAgent: {
              ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
              binaryPath: "C:\\Program Files\\Claude & Tools\\claude.exe",
            },
          },
        },
        "windows",
      ),
    ).toBe("& 'C:\\Program Files\\Claude & Tools\\claude.exe' auth login");
  });

  it("quotes a Claude path with shell metacharacters on POSIX", () => {
    const provider: ServerProvider = {
      ...readyClaude,
      driver: ProviderDriverKind.make("claudeAgent"),
      instanceId: ProviderInstanceId.make("claude"),
    };

    expect(
      resolveOnboardingProviderLoginCommand(
        provider,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            claudeAgent: {
              ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
              binaryPath: "/opt/Claude Tools/$current/claude",
            },
          },
        },
        "linux",
      ),
    ).toBe("'/opt/Claude Tools/$current/claude' auth login");
  });

  it.each([
    ["~/my tools/claude", "~/'my tools/claude' auth login"],
    ["~\\my tools\\claude", "~/'my tools\\claude' auth login"],
    ["~/tools/claude's build", `~/'tools/claude'"'"'s build' auth login`],
    ["~\\tools\\claude's build", `~/'tools\\claude'"'"'s build' auth login`],
    ["~/tools/claude; echo unsafe", "~/'tools/claude; echo unsafe' auth login"],
  ])("keeps the home prefix expandable while quoting %s", (binaryPath, expectedCommand) => {
    expect(
      resolveOnboardingProviderLoginCommand(
        readyClaude,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            claudeAgent: {
              ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
              binaryPath,
            },
          },
        },
        "linux",
      ),
    ).toBe(expectedCommand);
  });

  it.each(["darwin", "linux"] as const)("quotes backslashes in a Claude path on %s", (platform) => {
    expect(
      resolveOnboardingProviderLoginCommand(
        readyClaude,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            claudeAgent: {
              ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
              binaryPath: "/opt/claude\\work/claude",
            },
          },
        },
        platform,
      ),
    ).toBe("'/opt/claude\\work/claude' auth login");
  });

  it("keeps a plain Windows path unquoted", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        readyClaude,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            claudeAgent: {
              ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
              binaryPath: "C:\\Tools\\claude.exe",
            },
          },
        },
        "windows",
      ),
    ).toBe("C:\\Tools\\claude.exe auth login");
  });

  it("uses the default command when an old server reports an unknown shell", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        readyClaude,
        {
          ...DEFAULT_SERVER_SETTINGS,
          providers: {
            ...DEFAULT_SERVER_SETTINGS.providers,
            claudeAgent: {
              ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
              binaryPath: "/opt/Claude Tools/claude",
            },
          },
        },
        "unknown",
      ),
    ).toBe("claude auth login");
  });
});

describe("resolveOnboardingProviderInstallCommand", () => {
  it("uses the PowerShell installer on Windows environments", () => {
    expect(resolveOnboardingProviderInstallCommand("claudeAgent", "windows")).toBe(
      "irm https://claude.ai/install.ps1 | iex",
    );
  });

  it.each(["darwin", "linux", "unknown"] as const)("uses the shell installer on %s", (platform) => {
    expect(resolveOnboardingProviderInstallCommand("claudeAgent", platform)).toBe(
      "curl -fsSL https://claude.ai/install.sh | bash",
    );
  });
});
