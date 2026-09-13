import { EnvironmentAuthInvalidError, EnvironmentScopeRequiredError } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { mapRemoteEnvironmentError } from "./errors.ts";
import { RemoteEnvironmentAuthFetchError, RemoteEnvironmentAuthTimeoutError } from "../rpc/http.ts";

describe("mapRemoteEnvironmentError", () => {
  it("names an invalid credential as an authentication problem", () => {
    expect(
      mapRemoteEnvironmentError(
        new EnvironmentAuthInvalidError({
          code: "auth_invalid",
          reason: "invalid_credential",
          traceId: "trace-1",
        }),
      ),
    ).toMatchObject({
      _tag: "ConnectionBlockedError",
      reason: "authentication",
      detail: "The environment credential is invalid.",
      traceId: "trace-1",
    });
  });

  it("names a missing scope as a permission problem", () => {
    expect(
      mapRemoteEnvironmentError(
        new EnvironmentScopeRequiredError({
          code: "insufficient_scope",
          requiredScope: "orchestration:read",
          traceId: "trace-2",
        }),
      ),
    ).toMatchObject({
      _tag: "ConnectionBlockedError",
      reason: "permission",
    });
  });

  it.each([
    new RemoteEnvironmentAuthFetchError({
      message: "Failed to fetch remote environment endpoint.",
      cause: new TypeError("Failed to fetch"),
    }),
    new RemoteEnvironmentAuthTimeoutError("https://environment.example.test", 10_000),
  ])("keeps a transport failure retryable: $_tag", (error) => {
    expect(mapRemoteEnvironmentError(error)).toMatchObject({
      _tag: "ConnectionTransientError",
      detail: error.message,
    });
  });
});
