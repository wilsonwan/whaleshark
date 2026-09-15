import { expect, it } from "@effect/vitest";

import { decodeServicePreflightResult, runServicePreflight } from "./servicePreflight.ts";
import { SERVICE_LAUNCHER_PROTOCOL } from "./serviceProtocol.ts";

it("requires the installed launcher protocol", () => {
  expect(
    runServicePreflight({ launcherProtocol: SERVICE_LAUNCHER_PROTOCOL - 1, version: "1.2.3" }),
  ).toMatchObject({ status: "blocked", version: "1.2.3" });

  expect(
    runServicePreflight({ launcherProtocol: SERVICE_LAUNCHER_PROTOCOL, version: "1.2.3" }),
  ).toEqual({
    status: "ready",
    version: "1.2.3",
    launcherProtocol: SERVICE_LAUNCHER_PROTOCOL,
  });
});

it("points a blocked launcher at a source reinstall", () => {
  const result = runServicePreflight({
    launcherProtocol: SERVICE_LAUNCHER_PROTOCOL - 1,
    version: "1.2.3",
  });

  expect(result.status === "blocked" ? result.reason : undefined).toContain("t3 service install");
  expect(result.status === "blocked" ? result.reason : undefined).not.toContain("release");
});

it("round-trips a preflight result and rejects other documents", () => {
  expect(
    decodeServicePreflightResult({
      status: "ready",
      version: "1.2.3",
      launcherProtocol: SERVICE_LAUNCHER_PROTOCOL,
    }),
  ).toEqual({ status: "ready", version: "1.2.3", launcherProtocol: SERVICE_LAUNCHER_PROTOCOL });
  expect(
    decodeServicePreflightResult({
      status: "blocked",
      version: "1.2.3",
      reason: "different launcher",
    }),
  ).toEqual({ status: "blocked", version: "1.2.3", reason: "different launcher" });
  expect(
    decodeServicePreflightResult({
      status: "ready",
      version: "1.2.3",
      launcherProtocol: SERVICE_LAUNCHER_PROTOCOL - 1,
    }),
  ).toBeUndefined();
  expect(decodeServicePreflightResult(null)).toBeUndefined();
});
