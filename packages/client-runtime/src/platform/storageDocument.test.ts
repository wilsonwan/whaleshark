import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  BearerConnectionCredential,
  BearerConnectionProfile,
  BearerConnectionRegistration,
  SshConnectionProfile,
  SshConnectionRegistration,
} from "../connection/catalog.ts";
import { BearerConnectionTarget, SshConnectionTarget } from "../connection/model.ts";
import {
  ConnectionCatalogDocument,
  decodeConnectionCatalogDocument,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  registerConnectionInCatalog,
  removeConnectionFromCatalog,
} from "./storageDocument.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");

const BEARER_TARGET = new BearerConnectionTarget({
  environmentId: ENVIRONMENT_ID,
  label: "Remote",
  connectionId: "bearer-1",
});
const BEARER_PROFILE = new BearerConnectionProfile({
  connectionId: BEARER_TARGET.connectionId,
  environmentId: ENVIRONMENT_ID,
  label: BEARER_TARGET.label,
  httpBaseUrl: "https://remote.example.test",
  wsBaseUrl: "wss://remote.example.test",
});
const BEARER_CREDENTIAL = new BearerConnectionCredential({
  token: "bearer-token",
});

const SSH_TARGET = new SshConnectionTarget({
  environmentId: EnvironmentId.make("environment-2"),
  label: "Devbox",
  connectionId: "ssh-1",
});
const SSH_PROFILE = new SshConnectionProfile({
  connectionId: SSH_TARGET.connectionId,
  environmentId: SSH_TARGET.environmentId,
  label: SSH_TARGET.label,
  target: {
    alias: "devbox",
    hostname: "devbox.example.test",
    username: "developer",
    port: 22,
  },
});

/**
 * A catalog a pre-fork build wrote: it still carries a relay connection target
 * and the DPoP access token stored beside it, next to the bearer and SSH
 * connections the user actually paired.
 */
const LEGACY_DOCUMENT_JSON = `{
  "schemaVersion": 1,
  "targets": [
    { "_tag": "BearerConnectionTarget", "environmentId": "environment-1", "label": "Remote", "connectionId": "bearer-1" },
    { "_tag": "RelayConnectionTarget", "environmentId": "environment-relay", "label": "T3 Connect" },
    { "_tag": "SshConnectionTarget", "environmentId": "environment-2", "label": "Devbox", "connectionId": "ssh-1" }
  ],
  "profiles": [
    { "_tag": "BearerConnectionProfile", "connectionId": "bearer-1", "environmentId": "environment-1", "label": "Remote", "httpBaseUrl": "https://remote.example.test", "wsBaseUrl": "wss://remote.example.test" },
    { "_tag": "SshConnectionProfile", "connectionId": "ssh-1", "environmentId": "environment-2", "label": "Devbox", "target": { "alias": "devbox", "hostname": "devbox.example.test", "username": "developer", "port": 22 } }
  ],
  "credentials": [
    { "connectionId": "bearer-1", "credential": { "_tag": "BearerConnectionCredential", "token": "bearer-token" } }
  ],
  "remoteDpopTokens": [
    { "environmentId": "environment-relay", "accountId": "account-1", "label": "T3 Connect", "endpoint": { "httpBaseUrl": "https://relay.example.test", "wsBaseUrl": "wss://relay.example.test", "providerKind": "t3_relay" }, "accessToken": "dpop-token", "expiresAtEpochMs": 1000000, "dpopThumbprint": "thumbprint" }
  ]
}`;

/** A catalog written by a build whose only connection was a relay. */
const RELAY_ONLY_DOCUMENT_JSON = `{
  "schemaVersion": 1,
  "targets": [
    { "_tag": "RelayConnectionTarget", "environmentId": "environment-relay", "label": "T3 Connect" }
  ],
  "profiles": [],
  "credentials": [],
  "remoteDpopTokens": []
}`;

describe("ConnectionCatalogDocument", () => {
  it("loads a legacy catalog, dropping relay rows and DPoP tokens", () => {
    const restored = decodeConnectionCatalogDocument(JSON.parse(LEGACY_DOCUMENT_JSON));

    expect(Option.isSome(restored)).toBe(true);
    const document = Option.getOrThrow(restored);
    expect(document.schemaVersion).toBe(1);
    expect(document.targets).toEqual([BEARER_TARGET, SSH_TARGET]);
    expect(document.profiles).toEqual([BEARER_PROFILE, SSH_PROFILE]);
    expect(document.credentials).toEqual([
      { connectionId: BEARER_TARGET.connectionId, credential: BEARER_CREDENTIAL },
    ]);
    expect("remoteDpopTokens" in document).toBe(false);
  });

  it("keeps a relay-only catalog loadable instead of throwing", () => {
    const restored = decodeConnectionCatalogDocument(JSON.parse(RELAY_ONLY_DOCUMENT_JSON));

    expect(Option.getOrThrow(restored)).toEqual(EMPTY_CONNECTION_CATALOG_DOCUMENT);
  });

  it("reports an unreadable catalog as absent rather than throwing", () => {
    expect(Option.isNone(decodeConnectionCatalogDocument(null))).toBe(true);
    expect(Option.isNone(decodeConnectionCatalogDocument("not a catalog"))).toBe(true);
    expect(
      Option.isNone(
        decodeConnectionCatalogDocument({
          ...EMPTY_CONNECTION_CATALOG_DOCUMENT,
          profiles: [{ unsupported: true }],
        }),
      ),
    ).toBe(true);
  });

  it("round-trips the current catalog shape through JSON", () => {
    const document = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      new BearerConnectionRegistration({
        target: BEARER_TARGET,
        profile: BEARER_PROFILE,
        credential: BEARER_CREDENTIAL,
      }),
    );
    const schema = Schema.fromJsonString(ConnectionCatalogDocument);
    const restored = Schema.decodeUnknownSync(schema)(Schema.encodeSync(schema)(document));

    expect(restored).toEqual(document);
  });

  it("registers a bearer connection as one catalog mutation", () => {
    const document = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      new BearerConnectionRegistration({
        target: BEARER_TARGET,
        profile: BEARER_PROFILE,
        credential: BEARER_CREDENTIAL,
      }),
    );

    expect(document.targets).toEqual([BEARER_TARGET]);
    expect(document.profiles).toEqual([BEARER_PROFILE]);
    expect(document.credentials).toEqual([
      {
        connectionId: BEARER_TARGET.connectionId,
        credential: BEARER_CREDENTIAL,
      },
    ]);
  });

  it("removes every catalog record owned by an explicit disconnect", () => {
    const registered = registerConnectionInCatalog(
      registerConnectionInCatalog(
        EMPTY_CONNECTION_CATALOG_DOCUMENT,
        new BearerConnectionRegistration({
          target: BEARER_TARGET,
          profile: BEARER_PROFILE,
          credential: BEARER_CREDENTIAL,
        }),
      ),
      new SshConnectionRegistration({ target: SSH_TARGET, profile: SSH_PROFILE }),
    );

    expect(removeConnectionFromCatalog(registered, BEARER_TARGET)).toEqual({
      ...EMPTY_CONNECTION_CATALOG_DOCUMENT,
      targets: [SSH_TARGET],
      profiles: [SSH_PROFILE],
    });
  });

  it("persists the normalized SSH profile beside its target", () => {
    const document = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      new SshConnectionRegistration({ target: SSH_TARGET, profile: SSH_PROFILE }),
    );

    expect(document.targets).toEqual([SSH_TARGET]);
    expect(document.profiles).toEqual([SSH_PROFILE]);
    expect(document.credentials).toEqual([]);
  });
});
