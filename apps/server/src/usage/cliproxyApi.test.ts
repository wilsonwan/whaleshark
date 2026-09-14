import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { makeCliproxyApi } from "./cliproxyApi.ts";

const config = {
  kind: "cliproxy",
  url: "http://hub.test:8317",
  managementKey: "management-secret",
  enabled: true,
} as const;
const accounts = [
  {
    id: "first.json",
    auth_index: "a",
    provider: "claude",
    email: "first@example.com",
  },
  {
    id: "second.json",
    auth_index: "b",
    provider: "claude",
    email: "second@example.com",
  },
];
const claudeUsage = (input: { fiveHour?: number; sevenDay?: number } = {}) => ({
  five_hour: { utilization: input.fiveHour ?? 10, resets_at: null },
  seven_day: { utilization: input.sevenDay ?? 50, resets_at: "2099-01-01T00:00:00Z" },
  limits: [
    {
      kind: "weekly_scoped",
      percent: 80,
      resets_at: null,
      scope: { model: { display_name: "Fable" } },
    },
  ],
});
const RequestBody = Schema.Struct({
  auth_index: Schema.String,
  method: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  header: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  data: Schema.optional(Schema.String),
});
type RequestBody = typeof RequestBody.Type;
const decodeRequest = Schema.decodeUnknownSync(Schema.fromJsonString(RequestBody));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

function fixture(
  options: {
    accounts?: Array<(typeof accounts)[number] & { disabled?: boolean }>;
    upstream?: (request: RequestBody) => { status: number; body: unknown };
  } = {},
) {
  const requests: Array<{ path: string; body?: RequestBody }> = [];
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      expect(request.headers.authorization).toBe("Bearer management-secret");
      const path = new URL(request.url).pathname;
      const body =
        request.body._tag === "Uint8Array"
          ? decodeRequest(new TextDecoder().decode(request.body.body))
          : undefined;
      requests.push({ path, ...(body ? { body } : {}) });
      if (path.endsWith("/auth-files"))
        return HttpClientResponse.fromWeb(
          request,
          Response.json({ files: options.accounts ?? accounts }),
        );
      expect(path).toBe("/v0/management/api-call");
      expect(body?.header?.Authorization).toBe("Bearer $TOKEN$");
      const upstream = options.upstream?.(body!) ?? { status: 200, body: claudeUsage() };
      return HttpClientResponse.fromWeb(
        request,
        Response.json({ status_code: upstream.status, body: encodeJson(upstream.body) }),
      );
    }),
  );
  return {
    requests,
    api: makeCliproxyApi.pipe(Effect.provideService(HttpClient.HttpClient, http)),
  };
}

describe("CLIProxyAPI built-in management API", () => {
  it.effect("reads each account's Claude usage without plugin endpoints", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(1788710400000);
      const test = fixture();
      const api = yield* test.api;
      const result = yield* api.readAccounts(config);
      expect(result.map((account) => [account.driver, account.plan])).toEqual([
        ["claudeAgent", "Claude Subscription"],
        ["claudeAgent", "Claude Subscription"],
      ]);
      expect(
        result[0]?.usageLimits.windows.map((window) => [window.id, window.usedPercent]),
      ).toEqual([
        ["five_hour", 10],
        ["seven_day", 50],
        ["seven_day_fable", 80],
      ]);
      const calls = test.requests.filter((request) => request.body?.url);
      expect(calls.map((request) => request.body?.auth_index).sort()).toEqual(["a", "b"]);
      expect(calls[0]?.body?.url).toBe("https://api.anthropic.com/api/oauth/usage");
      expect(calls[0]?.body?.header?.["anthropic-beta"]).toBe("oauth-2025-04-20");
    }),
  );

  it.effect("isolates a failed account and never publishes upstream error bodies", () =>
    Effect.gen(function* () {
      const test = fixture({
        upstream: (request) =>
          request.auth_index === "a"
            ? { status: 401, body: { token: "do-not-publish" } }
            : { status: 200, body: claudeUsage() },
      });
      const api = yield* test.api;
      const result = yield* api.readAccounts(config);
      expect(result[0]?.usageLimits.unavailable?.reason).toBe("probeFailed");
      expect(result[1]?.usageLimits.windows[0]?.usedPercent).toBe(10);
      expect(encodeJson(result)).not.toContain("do-not-publish");
    }),
  );

  it.effect("skips disabled accounts", () =>
    Effect.gen(function* () {
      const test = fixture({ accounts: [{ ...accounts[0]!, disabled: true }] });
      const api = yield* test.api;
      expect(yield* api.readAccounts(config)).toEqual([]);
      expect(test.requests.every((request) => request.path.endsWith("/auth-files"))).toBe(true);
    }),
  );
});
