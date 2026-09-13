import * as Effect from "effect/Effect";
import {
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} from "@t3tools/contracts";
import { FetchHttpClient } from "effect/unstable/http";

import type { PreparedConnection, PreparedHttpAuthorization } from "../connection/model.ts";
import {
  executeEnvironmentHttpRequest,
  makeEnvironmentHttpApiGroupClient,
  RemoteEnvironmentAuthTimeoutError,
  type RemoteEnvironmentRequestError,
} from "../rpc/http.ts";

export interface EnvironmentHttpAuthHeaders {
  readonly authorization?: string;
}

export function withOrchestrationProtocolHeader(
  headers: EnvironmentHttpAuthHeaders,
): EnvironmentHttpAuthHeaders & {
  readonly [ORCHESTRATION_PROTOCOL_HEADER]: typeof ORCHESTRATION_PROTOCOL_VERSION_TEXT;
} {
  return {
    ...headers,
    [ORCHESTRATION_PROTOCOL_HEADER]: ORCHESTRATION_PROTOCOL_VERSION_TEXT,
  };
}

/**
 * Primary/local environments with no bearer credential authenticate the
 * browser via a session cookie. A cross-origin `fetch` does not send cookies by
 * default, so those requests must opt into credentialed mode; bearer
 * connections carry their credential in a header and need no cookies. Applied
 * per-request via `FetchHttpClient.RequestInit`, which the fetch client reads
 * from the fiber context at request time.
 */
const withEnvironmentCredentials = <A, E, R>(
  authorization: PreparedHttpAuthorization | null,
  request: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  authorization === null
    ? request.pipe(Effect.provideService(FetchHttpClient.RequestInit, { credentials: "include" }))
    : request;

/**
 * Build request-bound headers from the current environment credential:
 * - primary/local connections carry no credential,
 * - bearer connections send a static `Bearer` token.
 */
const buildEnvironmentAuthHeaders = (
  authorization: PreparedHttpAuthorization | null,
): EnvironmentHttpAuthHeaders =>
  authorization === null ? {} : { authorization: `Bearer ${authorization.token}` };

export const executeAuthenticatedEnvironmentHttpRequest = Effect.fn(
  "clientRuntime.state.executeAuthenticatedEnvironmentHttpRequest",
)(function* <
  Group extends Parameters<typeof makeEnvironmentHttpApiGroupClient>[1],
  A,
  E,
  R,
>(input: {
  readonly prepared: PreparedConnection;
  readonly url: (httpBaseUrl: string) => string;
  readonly timeoutMs: number;
  readonly group: Group;
  readonly request: (input: {
    readonly client: Effect.Success<ReturnType<typeof makeEnvironmentHttpApiGroupClient<Group>>>;
    readonly headers: EnvironmentHttpAuthHeaders;
  }) => Effect.Effect<A, E, R>;
}): Effect.fn.Return<
  A,
  RemoteEnvironmentRequestError,
  Effect.Services<ReturnType<typeof makeEnvironmentHttpApiGroupClient<Group>>> | R
> {
  const httpBaseUrl = input.prepared.httpBaseUrl;
  const requestUrl = input.url(httpBaseUrl);
  const client = yield* makeEnvironmentHttpApiGroupClient(httpBaseUrl, input.group);
  const headers = buildEnvironmentAuthHeaders(input.prepared.httpAuthorization);
  return yield* executeEnvironmentHttpRequest(
    requestUrl,
    input.timeoutMs,
    withEnvironmentCredentials(
      input.prepared.httpAuthorization,
      input.request({ client, headers }),
    ),
  ).pipe(
    Effect.timeoutOrElse({
      duration: input.timeoutMs,
      orElse: () =>
        Effect.fail(new RemoteEnvironmentAuthTimeoutError(input.url(httpBaseUrl), input.timeoutMs)),
    }),
  );
});
