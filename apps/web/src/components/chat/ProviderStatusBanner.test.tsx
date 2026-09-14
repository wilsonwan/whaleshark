import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  getProviderStatusBannerKey,
  getProviderStatusMessage,
  ProviderStatusBanner,
  shouldShowProviderStatusBanner,
} from "./ProviderStatusBanner";

function warningProvider(): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Claude",
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "warning",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-23T12:00:00.000Z",
    message: "Provider is temporarily degraded.",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

describe("ProviderStatusBanner", () => {
  it("shows installation and startup failures before auth is checked", () => {
    const status: ServerProvider = {
      ...warningProvider(),
      auth: { status: "unknown" },
    };

    expect(shouldShowProviderStatusBanner({ ...status, installed: false }, null)).toBe(true);
    expect(shouldShowProviderStatusBanner({ ...status, status: "error" }, null)).toBe(true);
    expect(
      shouldShowProviderStatusBanner(
        {
          ...status,
          instanceId: ProviderInstanceId.make("pi"),
          driver: ProviderDriverKind.make("pi"),
        },
        null,
      ),
    ).toBe(true);
  });

  it("hides the banner once the provider reports a settled status", () => {
    expect(shouldShowProviderStatusBanner(null, null)).toBe(false);
    expect(shouldShowProviderStatusBanner({ ...warningProvider(), status: "ready" }, null)).toBe(
      false,
    );
    expect(shouldShowProviderStatusBanner({ ...warningProvider(), status: "disabled" }, null)).toBe(
      false,
    );
  });

  it("stays hidden after its current warning is dismissed", () => {
    const status = warningProvider();

    expect(shouldShowProviderStatusBanner(status, null)).toBe(true);
    expect(shouldShowProviderStatusBanner(status, getProviderStatusBannerKey(status))).toBe(false);
  });

  it("renders an accessible dismiss control for provider warnings", () => {
    const markup = renderToStaticMarkup(
      <ProviderStatusBanner status={warningProvider()} onDismiss={() => {}} />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-label="Dismiss Claude provider warning"');
  });

  it("labels error dismiss controls with the correct severity", () => {
    const markup = renderToStaticMarkup(
      <ProviderStatusBanner
        status={{ ...warningProvider(), status: "error" }}
        onDismiss={() => {}}
      />,
    );

    expect(markup).toContain('aria-label="Dismiss Claude provider error"');
  });

  it("opens provider setup only when the environment reports setup capability", () => {
    const signedOut: ServerProvider = {
      ...warningProvider(),
      status: "error",
      auth: { status: "unauthenticated" },
      message: "",
    };

    const withSetup = renderToStaticMarkup(
      <ProviderStatusBanner
        status={{ ...signedOut, setup: { canAuthenticate: true, canInstall: false } }}
        onDismiss={() => {}}
        onOpenProviderSetup={() => {}}
      />,
    );

    expect(withSetup).toMatch(/>Open provider setup</);

    const withoutSetup = renderToStaticMarkup(
      <ProviderStatusBanner
        status={signedOut}
        onDismiss={() => {}}
        onOpenProviderSetup={() => {}}
      />,
    );

    expect(withoutSetup).not.toContain("Open provider setup");
  });
});

describe("getProviderStatusMessage", () => {
  it("preserves the environment's authentication error", () => {
    const message = "SUBSCRIPTION_REQUIRED: This account cannot use the provider.";
    expect(
      getProviderStatusMessage({
        ...warningProvider(),
        status: "error",
        auth: { status: "unauthenticated" },
        message,
      }),
    ).toBe(message);
  });

  it("points a provider with integrated setup to provider setup when signed out", () => {
    expect(
      getProviderStatusMessage({
        ...warningProvider(),
        status: "error",
        auth: { status: "unauthenticated" },
        message: "",
        setup: { canAuthenticate: true, canInstall: false },
      }),
    ).toBe("Open provider setup to sign in.");
  });

  it("requires installation on the environment before sign-in", () => {
    expect(
      getProviderStatusMessage({
        ...warningProvider(),
        displayName: "Claude work account",
        installed: false,
        status: "error",
        auth: { status: "unauthenticated" },
        message: "",
        setup: { canAuthenticate: true, canInstall: true },
      }),
    ).toBe("Open provider setup to install Claude Agent on this environment.");
  });

  it("keeps CLI sign-in advice for a provider without integrated setup", () => {
    expect(
      getProviderStatusMessage({
        ...warningProvider(),
        status: "error",
        auth: { status: "unauthenticated" },
        message: "",
      }),
    ).toBe("Sign in via the CLI to authenticate again.");
  });
});
