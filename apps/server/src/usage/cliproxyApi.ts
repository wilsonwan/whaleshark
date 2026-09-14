import {
  ProviderDriverKind,
  UsageLimitSourceError,
  type UsageLimitSourceAccount,
  type UsageLimitSourceConfig,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { claudeUsageResponseToLimits } from "../provider/Layers/claudeUsageLimits.ts";
import { makeUnavailableUsageLimits } from "../provider/providerUsageLimits.ts";

const AuthFile = Schema.Struct({
  id: Schema.String,
  auth_index: Schema.String,
  provider: Schema.String,
  email: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  id_token: Schema.optional(
    Schema.Struct({
      chatgpt_account_id: Schema.optional(Schema.String),
      chatgpt_plan_type: Schema.optional(Schema.String),
    }),
  ),
});
const AuthFiles = Schema.Struct({ files: Schema.Array(AuthFile) });
const ApiResponse = Schema.Struct({ status_code: Schema.Number, body: Schema.String });
const ClaudeWindow = Schema.Struct({
  utilization: Schema.Number,
  resets_at: Schema.NullOr(Schema.String),
});
const ClaudeUsage = Schema.Struct({
  five_hour: Schema.optional(Schema.NullOr(ClaudeWindow)),
  seven_day: Schema.optional(Schema.NullOr(ClaudeWindow)),
  limits: Schema.optional(
    Schema.Array(
      Schema.Struct({
        kind: Schema.String,
        percent: Schema.optional(Schema.NullOr(Schema.Number)),
        resets_at: Schema.optional(Schema.NullOr(Schema.String)),
        scope: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              model: Schema.optional(Schema.NullOr(Schema.Struct({ display_name: Schema.String }))),
            }),
          ),
        ),
      }),
    ),
  ),
});

const decodeAuthFiles = Schema.decodeUnknownEffect(AuthFiles);
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeApiResponse = Schema.decodeUnknownEffect(ApiResponse);
const decodeClaudeUsage = Schema.decodeUnknownEffect(Schema.fromJsonString(ClaudeUsage));

export const makeCliproxyApi = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;

  const management = Effect.fn("CliproxyApi.management")(function* (
    config: UsageLimitSourceConfig,
    path: string,
    body?: unknown,
  ) {
    const url = yield* Effect.try({
      try: () => new URL(`/v0/management/${path}`, config.url).toString(),
      catch: () => new UsageLimitSourceError({ detail: "The hub URL is not valid." }),
    });
    const request = (
      body === undefined ? HttpClientRequest.get(url) : HttpClientRequest.post(url)
    ).pipe(HttpClientRequest.setHeader("Authorization", `Bearer ${config.managementKey}`));
    const response = yield* client
      .execute(body === undefined ? request : request.pipe(HttpClientRequest.bodyJsonUnsafe(body)))
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.json),
        Effect.timeout("15 seconds"),
        Effect.mapError(
          () => new UsageLimitSourceError({ detail: "The hub management request failed." }),
        ),
      );
    return response;
  });

  const authFiles = Effect.fn("CliproxyApi.authFiles")(function* (config: UsageLimitSourceConfig) {
    const response = yield* management(config, "auth-files");
    return (yield* decodeAuthFiles(response)).files;
  });

  const apiCall = Effect.fn("CliproxyApi.apiCall")(function* (
    config: UsageLimitSourceConfig,
    account: typeof AuthFile.Type,
    url: string,
    data?: unknown,
  ) {
    const header = { Authorization: "Bearer $TOKEN$", "anthropic-beta": "oauth-2025-04-20" };
    const raw = yield* management(config, "api-call", {
      auth_index: account.auth_index,
      method: data === undefined ? "GET" : "POST",
      url,
      header,
      ...(data === undefined ? {} : { data: yield* encodeJson(data) }),
    });
    const response = yield* decodeApiResponse(raw);
    if (response.status_code < 200 || response.status_code >= 300) {
      return yield* new UsageLimitSourceError({
        detail: `The provider refused the hub request (HTTP ${response.status_code}).`,
      });
    }
    return response.body;
  });

  const readAccount = Effect.fn("CliproxyApi.readAccount")(function* (
    config: UsageLimitSourceConfig,
    account: typeof AuthFile.Type,
  ) {
    const checkedAt = DateTime.formatIso(yield* DateTime.now);
    const base = {
      id: account.id,
      driver: ProviderDriverKind.make("claudeAgent"),
      ...(account.email ? { email: account.email } : {}),
    };
    const read = Effect.gen(function* () {
      const body = yield* apiCall(config, account, "https://api.anthropic.com/api/oauth/usage");
      const usage = yield* decodeClaudeUsage(body);
      const model_scoped = (usage.limits ?? []).flatMap((limit) =>
        limit.kind === "weekly_scoped" && limit.scope?.model && typeof limit.percent === "number"
          ? [
              {
                display_name: limit.scope.model.display_name,
                utilization: limit.percent,
                resets_at: limit.resets_at ?? null,
              },
            ]
          : [],
      );
      return {
        ...base,
        plan: "Claude Subscription",
        usageLimits: claudeUsageResponseToLimits({
          checkedAt,
          response: {
            rate_limits_available: true,
            rate_limits: {
              five_hour: usage.five_hour ?? null,
              seven_day: usage.seven_day ?? null,
              model_scoped,
            },
          },
        }).limits,
      };
    });
    return yield* read.pipe(
      Effect.orElseSucceed(() => ({
        ...base,
        usageLimits: makeUnavailableUsageLimits({
          checkedAt,
          reason: "probeFailed",
          message: "The hub could not read this account's usage.",
        }),
      })),
    );
  });

  const readAccounts = Effect.fn("CliproxyApi.readAccounts")(function* (
    config: UsageLimitSourceConfig,
  ): Effect.fn.Return<ReadonlyArray<UsageLimitSourceAccount>, UsageLimitSourceError> {
    const accounts = yield* authFiles(config).pipe(
      Effect.mapError(
        () => new UsageLimitSourceError({ detail: "The hub could not list accounts." }),
      ),
    );
    return yield* Effect.forEach(
      accounts.filter((account) => !account.disabled && account.provider === "claude"),
      (account) => readAccount(config, account),
      { concurrency: 4 },
    );
  });

  return { readAccounts };
});
