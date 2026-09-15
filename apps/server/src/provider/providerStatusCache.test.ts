import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";

import {
  hydrateCachedProvider,
  isCachedProviderCorrelated,
  readProviderStatusCache,
  resolveProviderStatusCachePath,
  writeProviderStatusCache,
} from "./providerStatusCache.ts";

const emptyCapabilities = createModelCapabilities({ optionDescriptors: [] });
const PI_DRIVER = ProviderDriverKind.make("pi");
const OPENCODE_DRIVER = ProviderDriverKind.make("opencode");

const makeProvider = (
  provider: ProviderDriverKind,
  overrides?: Partial<ServerProvider>,
): ServerProvider => ({
  instanceId: defaultInstanceIdForDriver(provider),
  driver: provider,
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-04-11T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  ...overrides,
});

it.layer(NodeServices.layer)("providerStatusCache", (it) => {
  it.effect("logs structural diagnostics without retaining invalid cache contents", () => {
    const messages: Array<unknown> = [];
    const logger = Logger.make<unknown, void>((options) => {
      if (Array.isArray(options.message)) {
        messages.push(...options.message);
      } else {
        messages.push(options.message);
      }
    });

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-provider-cache-invalid-" });
      const cachePath = `${tempDir}/provider.json`;
      const secretCacheValue = "secret-cache-value";
      yield* fs.writeFileString(cachePath, `{ "token": "${secretCacheValue}" }`);

      const result = yield* readProviderStatusCache(cachePath);

      assert.strictEqual(result, undefined);
      const failure = messages.find(
        (message): message is Record<string, unknown> =>
          typeof message === "object" && message !== null && "path" in message,
      );
      assert.exists(failure);
      assert.strictEqual(failure.path, cachePath);
      assert.strictEqual(typeof failure.errorTag, "string");
      assert.ok(!("cause" in failure));
      assert.ok(!("issues" in failure));
      assert.ok(!Object.values(failure).map(String).join("\n").includes(secretCacheValue));
    }).pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false })));
  });

  it.effect("writes and reads provider status snapshots", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-provider-cache-" });
      const piProvider = makeProvider(PI_DRIVER, {
        status: "warning",
        auth: { status: "unknown" },
      });
      const openCodeProvider = makeProvider(OPENCODE_DRIVER, {
        status: "warning",
        auth: { status: "unknown", type: "opencode" },
      });
      const piPath = yield* resolveProviderStatusCachePath({
        cacheDir: tempDir,
        instanceId: defaultInstanceIdForDriver(ProviderDriverKind.make("pi")),
      });
      const openCodePath = yield* resolveProviderStatusCachePath({
        cacheDir: tempDir,
        instanceId: defaultInstanceIdForDriver(ProviderDriverKind.make("opencode")),
      });

      yield* writeProviderStatusCache({
        filePath: piPath,
        provider: piProvider,
      });
      yield* writeProviderStatusCache({
        filePath: openCodePath,
        provider: openCodeProvider,
      });

      assert.deepStrictEqual(yield* readProviderStatusCache(piPath), piProvider);
      assert.deepStrictEqual(yield* readProviderStatusCache(openCodePath), openCodeProvider);
    }),
  );

  it("hydrates cached provider status while preserving current settings-derived models", () => {
    const cachedClaude = makeProvider(PI_DRIVER, {
      checkedAt: "2026-04-10T12:00:00.000Z",
      models: [
        {
          slug: "claude-old-mini",
          name: "Claude Old Mini",
          isCustom: false,
          capabilities: emptyCapabilities,
        },
      ],
      message: "Cached message",
      skills: [
        {
          name: "github:gh-fix-ci",
          path: "/tmp/skills/gh-fix-ci/SKILL.md",
          enabled: true,
          displayName: "CI Debug",
        },
      ],
    });
    const fallbackClaude = makeProvider(PI_DRIVER, {
      models: [
        {
          slug: "claude-sonnet-5",
          name: "Claude Sonnet 5",
          isCustom: false,
          capabilities: emptyCapabilities,
        },
      ],
      message: "Pending refresh",
    });

    assert.deepStrictEqual(
      hydrateCachedProvider({
        cachedProvider: cachedClaude,
        fallbackProvider: fallbackClaude,
      }),
      {
        ...fallbackClaude,
        models: [
          ...fallbackClaude.models,
          {
            slug: "claude-old-mini",
            name: "Claude Old Mini",
            isCustom: false,
            capabilities: emptyCapabilities,
          },
        ],
        installed: cachedClaude.installed,
        version: cachedClaude.version,
        status: cachedClaude.status,
        auth: cachedClaude.auth,
        checkedAt: cachedClaude.checkedAt,
        slashCommands: cachedClaude.slashCommands,
        skills: cachedClaude.skills,
        message: cachedClaude.message,
      },
    );
  });

  it("does not resurrect cached custom models that settings no longer declare", () => {
    const builtIn = {
      slug: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      isCustom: false,
      capabilities: emptyCapabilities,
    } as const;
    const cachedClaude = makeProvider(PI_DRIVER, {
      models: [
        builtIn,
        {
          slug: "removed-custom",
          name: "removed-custom",
          isCustom: true,
          capabilities: emptyCapabilities,
        },
      ],
    });
    const fallbackClaude = makeProvider(PI_DRIVER, { models: [builtIn] });

    assert.deepStrictEqual(
      hydrateCachedProvider({
        cachedProvider: cachedClaude,
        fallbackProvider: fallbackClaude,
      }).models,
      [builtIn],
    );
  });

  it("ignores stale cached enabled state when the provider is now disabled", () => {
    const cachedClaude = makeProvider(PI_DRIVER, {
      checkedAt: "2026-04-10T12:00:00.000Z",
      message: "Cached ready status",
    });
    const disabledFallback = makeProvider(PI_DRIVER, {
      enabled: false,
      installed: false,
      version: null,
      status: "disabled",
      auth: { status: "unknown" },
      message: "Claude is disabled in T3 Code settings.",
    });

    assert.deepStrictEqual(
      hydrateCachedProvider({
        cachedProvider: cachedClaude,
        fallbackProvider: disabledFallback,
      }),
      disabledFallback,
    );
  });

  it("rejects cached snapshots that are not correlated to the fallback instance", () => {
    const fallbackClaude = makeProvider(PI_DRIVER, {
      models: [
        {
          slug: "claude-sonnet-5",
          name: "Claude Sonnet 5",
          isCustom: false,
          capabilities: emptyCapabilities,
        },
      ],
    });
    const legacyCachedProvider = {
      provider: ProviderDriverKind.make("pi"),
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-04-10T12:00:00.000Z",
      models: [
        {
          slug: "cached-legacy-model",
          name: "Cached Legacy Model",
          isCustom: false,
          capabilities: emptyCapabilities,
        },
      ],
      slashCommands: [],
      skills: [],
    } as unknown as ServerProvider;
    const mismatchedCachedClaude = makeProvider(PI_DRIVER, {
      instanceId: ProviderInstanceId.make("claude_personal"),
    });

    assert.strictEqual(
      isCachedProviderCorrelated({
        cachedProvider: legacyCachedProvider,
        fallbackProvider: fallbackClaude,
      }),
      false,
    );
    assert.deepStrictEqual(
      hydrateCachedProvider({
        cachedProvider: legacyCachedProvider,
        fallbackProvider: fallbackClaude,
      }),
      fallbackClaude,
    );
    assert.strictEqual(
      isCachedProviderCorrelated({
        cachedProvider: mismatchedCachedClaude,
        fallbackProvider: fallbackClaude,
      }),
      false,
    );
    assert.deepStrictEqual(
      hydrateCachedProvider({
        cachedProvider: mismatchedCachedClaude,
        fallbackProvider: fallbackClaude,
      }),
      fallbackClaude,
    );
  });
});
