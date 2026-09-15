import {
  ProviderDriverKind,
  UsageLimitSourceError,
  type UsageLimitSourceAccount,
  type UsageLimitSourceConfig,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import {
  clampPercent,
  makeUnavailableUsageLimits,
  makeUsageLimits,
} from "../provider/providerUsageLimits.ts";

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

function makeCliproxyUsageLimits(
  checkedAt: string,
  usage: typeof ClaudeUsage.Type,
): ReturnType<typeof makeUsageLimits> {
  const windows: ServerProviderUsageWindow[] = [];
  const fiveHour = usage.five_hour;
  if (fiveHour?.utilization !== undefined) {
    windows.push({
      id: "five_hour",
      kind: "session",
      label: "Session",
      windowDurationMins: 5 * 60,
      usedPercent: clampPercent(fiveHour.utilization),
      ...(fiveHour.resets_at ? { resetsAt: fiveHour.resets_at } : {}),
    });
  }
  const sevenDay = usage.seven_day;
  if (sevenDay?.utilization !== undefined) {
    windows.push({
      id: "seven_day",
      kind: "weekly",
      label: "Weekly",
      windowDurationMins: 7 * 24 * 60,
      usedPercent: clampPercent(sevenDay.utilization),
      ...(sevenDay.resets_at ? { resetsAt: sevenDay.resets_at } : {}),
    });
  }
  for (const limit of usage.limits ?? []) {
    const model = limit.scope?.model?.display_name;
    if (
      limit.kind !== "weekly_scoped" ||
      model === undefined ||
      typeof limit.percent !== "number"
    ) {
      continue;
    }
    const id = `seven_day_${model.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    windows.push({
      id,
      kind: "weekly",
      label: `Weekly · ${model}`,
      windowDurationMins: 7 * 24 * 60,
      usedPercent: clampPercent(limit.percent),
      ...(limit.resets_at ? { resetsAt: limit.resets_at } : {}),
    });
  }
  return makeUsageLimits({ checkedAt, windows });
}

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
      driver: ProviderDriverKind.make("pi"),
      ...(account.email ? { email: account.email } : {}),
    };
    const read = Effect.gen(function* () {
      const body = yield* apiCall(config, account, "https://api.anthropic.com/api/oauth/usage");
      const usage = yield* decodeClaudeUsage(body);
      return {
        ...base,
        plan: "Claude Subscription",
        usageLimits: makeCliproxyUsageLimits(checkedAt, usage),
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
