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

const readyPi: ServerProvider = {
  instanceId: ProviderInstanceId.make("pi"),
  driver: ProviderDriverKind.make("pi"),
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
  it("treats an enabled Pi provider with ready status and unknown authentication as ready", () => {
    expect(getOnboardingProviderState(readyPi)).toBe("ready");
  });

  it("treats authenticated providers as ready only when their provider status is ready", () => {
    expect(getOnboardingProviderState({ ...readyPi, auth: { status: "authenticated" } })).toBe(
      "ready",
    );
    expect(
      getOnboardingProviderState({
        ...readyPi,
        auth: { status: "authenticated" },
        status: "error",
      }),
    ).toBe("attention");
    expect(
      getOnboardingProviderState({
        ...readyPi,
        auth: { status: "authenticated" },
        status: "warning",
      }),
    ).toBe("attention");
  });

  it("offers sign-in only when the server reports an authentication failure", () => {
    expect(
      getOnboardingProviderState({
        ...readyPi,
        status: "error",
        auth: { status: "unauthenticated" },
      }),
    ).toBe("signIn");
    expect(getOnboardingProviderState({ ...readyPi, status: "error" })).toBe("attention");
    expect(getOnboardingProviderState({ ...readyPi, status: "warning" })).toBe("attention");
  });

  it("does not offer installation or sign-in for disabled providers", () => {
    expect(getOnboardingProviderState({ ...readyPi, enabled: false, installed: false })).toBe(
      "disabled",
    );
    expect(getOnboardingProviderState({ ...readyPi, status: "disabled" })).toBe("disabled");
  });

  it("offers installation only when an enabled provider is missing", () => {
    expect(getOnboardingProviderState({ ...readyPi, installed: false, status: "error" })).toBe(
      "install",
    );
  });

  it("waits for a provider snapshot before offering an action", () => {
    expect(getOnboardingProviderState(undefined)).toBe("checking");
  });
});

describe("selectOnboardingProvidersByDriver", () => {
  it("prefers a ready instance with unknown authentication to an unauthenticated instance", () => {
    const signedOutPi: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
      status: "error",
      auth: { status: "unauthenticated" },
    };

    expect(selectOnboardingProvidersByDriver([signedOutPi, readyPi]).get("pi")).toBe(readyPi);
  });

  it("prefers a provider with an actionable sign-in over a failed provider", () => {
    const failedPi: ServerProvider = { ...readyPi, status: "error" };
    const signedOutPi: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
      status: "error",
      auth: { status: "unauthenticated" },
    };

    expect(selectOnboardingProvidersByDriver([failedPi, signedOutPi]).get("pi")).toBe(signedOutPi);
  });

  it("prefers installed providers over missing or disabled instances", () => {
    const disabledPi: ServerProvider = { ...readyPi, enabled: false };
    const missingPi: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
      installed: false,
      status: "error",
    };

    expect(selectOnboardingProvidersByDriver([disabledPi, missingPi, readyPi]).get("pi")).toBe(
      readyPi,
    );
  });

  it("handles provider snapshots that have not arrived", () => {
    expect(selectOnboardingProvidersByDriver(undefined).size).toBe(0);
  });

  it("keeps a ready custom account when the default account is signed out", () => {
    const signedOutDefault: ServerProvider = {
      ...readyPi,
      status: "error",
      auth: { status: "unauthenticated" },
    };
    const readyCustom: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
    };

    expect(selectOnboardingProvidersByDriver([signedOutDefault, readyCustom]).get("pi")).toBe(
      readyCustom,
    );
  });
});

describe("resolveOnboardingProviderLoginCommand", () => {
  // OpenCode is the surviving provider whose CLI carries a `auth login` flow.
  const opencodeInstanceId = ProviderInstanceId.make("opencode_work");
  const opencodeProvider: ServerProvider = {
    ...readyPi,
    driver: ProviderDriverKind.make("opencode"),
    instanceId: opencodeInstanceId,
  };
  const settingsWithBinaryPath = (binaryPath: string) => ({
    ...DEFAULT_SERVER_SETTINGS,
    providerInstances: {
      [opencodeInstanceId]: {
        driver: ProviderDriverKind.make("opencode"),
        config: { binaryPath },
      },
    },
  });

  it("uses the selected OpenCode account binary", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        opencodeProvider,
        settingsWithBinaryPath("/opt/opencode-work/bin/opencode"),
        "linux",
      ),
    ).toBe("/opt/opencode-work/bin/opencode auth login");
  });

  it("falls back to the plain CLI when the instance has no binary path", () => {
    expect(
      resolveOnboardingProviderLoginCommand(opencodeProvider, DEFAULT_SERVER_SETTINGS, "linux"),
    ).toBe("opencode auth login");
  });

  it("quotes an OpenCode path with spaces for PowerShell", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        opencodeProvider,
        settingsWithBinaryPath("C:\\Program Files\\OpenCode & Tools\\opencode.exe"),
        "windows",
      ),
    ).toBe("& 'C:\\Program Files\\OpenCode & Tools\\opencode.exe' auth login");
  });

  it("quotes an OpenCode path with shell metacharacters on POSIX", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        opencodeProvider,
        settingsWithBinaryPath("/opt/OpenCode Tools/$current/opencode"),
        "linux",
      ),
    ).toBe("'/opt/OpenCode Tools/$current/opencode' auth login");
  });

  it.each([
    ["~/my tools/opencode", "~/'my tools/opencode' auth login"],
    ["~\\my tools\\opencode", "~/'my tools\\opencode' auth login"],
    ["~/tools/opencode's build", `~/'tools/opencode'"'"'s build' auth login`],
    ["~\\tools\\opencode's build", `~/'tools\\opencode'"'"'s build' auth login`],
    ["~/tools/opencode; echo unsafe", "~/'tools/opencode; echo unsafe' auth login"],
  ])("keeps the home prefix expandable while quoting %s", (binaryPath, expectedCommand) => {
    expect(
      resolveOnboardingProviderLoginCommand(
        opencodeProvider,
        settingsWithBinaryPath(binaryPath),
        "linux",
      ),
    ).toBe(expectedCommand);
  });

  it.each(["darwin", "linux"] as const)(
    "quotes backslashes in an OpenCode path on %s",
    (platform) => {
      expect(
        resolveOnboardingProviderLoginCommand(
          opencodeProvider,
          settingsWithBinaryPath("/opt/opencode\\work/opencode"),
          platform,
        ),
      ).toBe("'/opt/opencode\\work/opencode' auth login");
    },
  );

  it("keeps a plain Windows path unquoted", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        opencodeProvider,
        settingsWithBinaryPath("C:\\Tools\\opencode.exe"),
        "windows",
      ),
    ).toBe("C:\\Tools\\opencode.exe auth login");
  });

  it("uses the default command when an old server reports an unknown shell", () => {
    expect(
      resolveOnboardingProviderLoginCommand(
        opencodeProvider,
        settingsWithBinaryPath("/opt/OpenCode Tools/opencode"),
        "unknown",
      ),
    ).toBe("opencode auth login");
  });

  it("does not build a login command for drivers without one", () => {
    expect(resolveOnboardingProviderLoginCommand(readyPi, DEFAULT_SERVER_SETTINGS, "linux")).toBe(
      "pi",
    );
  });
});

describe("resolveOnboardingProviderInstallCommand", () => {
  const piInstall = "npm install -g @earendil-works/pi-coding-agent";

  it("uses Pi's npm install on Windows environments", () => {
    expect(resolveOnboardingProviderInstallCommand("pi", "windows")).toBe(piInstall);
  });

  it.each(["darwin", "linux", "unknown"] as const)("uses Pi's npm install on %s", (platform) => {
    expect(resolveOnboardingProviderInstallCommand("pi", platform)).toBe(piInstall);
  });
});
