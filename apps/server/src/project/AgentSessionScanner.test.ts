import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeOS from "node:os";
import { describe, expect, it } from "@effect/vitest";
import {
  type AgentSessionSource,
  type OrchestrationProjectShell,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerSettings as ContractServerSettings,
} from "@t3tools/contracts";
import { symlinksSupported } from "@t3tools/shared/testing/symlinks";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerConfig from "../config.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as AgentSessionScanner from "./AgentSessionScanner.ts";

const makeProjectShell = (workspaceRoot: string): OrchestrationProjectShell => ({
  id: ProjectId.make("project-1"),
  title: "Imported",
  workspaceRoot,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

/** Only `getShellSnapshot` is exercised; the rest must not be called. */
const makeProjectionSnapshotQueryLayer = (importedWorkspaceRoots: ReadonlyArray<string>) =>
  Layer.succeed(ProjectionSnapshotQuery.ProjectionSnapshotQuery, {
    getCommandReadModel: () => Effect.die("unused"),
    getUserInputActivity: () => Effect.die("unused"),
    getSnapshot: () => Effect.die("unused"),
    getShellSnapshot: () =>
      Effect.succeed({
        snapshotSequence: 0,
        projects: importedWorkspaceRoots.map((workspaceRoot) => makeProjectShell(workspaceRoot)),
        threads: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    getShellSnapshotWithoutEnrichment: () => Effect.die("unused"),
    getProjectShellsWithoutEnrichment: () => Effect.die("unused"),
    getArchivedShellSnapshot: () => Effect.die("unused"),
    getSnapshotSequence: () => Effect.die("unused"),
    getCounts: () => Effect.die("unused"),
    getEventReplayStats: () => Effect.die("unused"),
    getActiveProjectByWorkspaceRoot: () => Effect.die("unused"),
    getProjectShells: () => Effect.die("unused"),
    getProjectShellById: () => Effect.die("unused"),
    getImportedAgentSessionSources: () => Effect.succeed([]),
    getFirstActiveThreadIdByProjectId: () => Effect.die("unused"),
    getThreadCheckpointContext: () => Effect.die("unused"),
    getFullThreadDiffContext: () => Effect.die("unused"),
    getThreadShellById: () => Effect.die("unused"),
    getThreadRuntimeContext: () => Effect.die("unused"),
    getTurnStartMessage: () => Effect.die("unused"),
    getThreadDetailById: () => Effect.die("unused"),
    getThreadDetailSnapshot: () => Effect.die("unused"),
    searchThreads: () => Effect.die("unused"),
  });

/**
 * Run a scan against the given home. The home is a temp dir created inside the
 * test, so the layer is built per run rather than shared.
 */
interface ScannerTestInput {
  readonly claudeHomePath: string;
  readonly importedWorkspaceRoots?: ReadonlyArray<string>;
  /** Base dir for the test ServerConfig; worktreesDir derives from it. */
  readonly configBaseDir?: string;
  readonly providerInstances?: ContractServerSettings["providerInstances"];
}

const makeScannerTestLayer = (input: ScannerTestInput) =>
  AgentSessionScanner.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        ServerSettings.layerTest({
          providers: {
            claudeAgent: { homePath: input.claudeHomePath },
          },
          ...(input.providerInstances === undefined
            ? {}
            : { providerInstances: input.providerInstances }),
        }),
        ServerConfig.layerTest(
          input.codexHomePath,
          input.configBaseDir ?? { prefix: "t3code-scanner-config-" },
        ),
        makeProjectionSnapshotQueryLayer(input.importedWorkspaceRoots ?? []),
      ),
    ),
  );

const runScan = (input: ScannerTestInput) =>
  Effect.gen(function* () {
    const scanner = yield* AgentSessionScanner.AgentSessionScanner;
    return yield* scanner.scan;
  }).pipe(Effect.provide(makeScannerTestLayer(input)));

const runRecentThreadOutcomes = (input: ScannerTestInput & { readonly workspaceRoot: string }) =>
  Effect.gen(function* () {
    const scanner = yield* AgentSessionScanner.AgentSessionScanner;
    return yield* scanner.recentThreads(input.workspaceRoot).pipe(
      Stream.runCollect,
      Effect.map((outcomes) => Array.from(outcomes)),
    );
  }).pipe(Effect.provide(makeScannerTestLayer(input)));

const runRecentThreads = (input: ScannerTestInput & { readonly workspaceRoot: string }) =>
  runRecentThreadOutcomes(input).pipe(
    Effect.map((outcomes) =>
      outcomes.flatMap((outcome) => (outcome._tag === "Importable" ? [outcome.thread] : [])),
    ),
  );

const makeTempDir = Effect.fn("AgentSessionScanner.test.makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix });
});

const writeTranscript = Effect.fn("AgentSessionScanner.test.writeTranscript")(function* (input: {
  readonly filePath: string;
  readonly contents: string;
  /** Epoch millis, so ordering assertions never depend on write timing. */
  readonly mtimeMs: number;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(path.dirname(input.filePath), { recursive: true });
  yield* fileSystem.writeFileString(input.filePath, input.contents);
  // Numeric utimes arguments are seconds, not milliseconds.
  const seconds = input.mtimeMs / 1000;
  yield* fileSystem.utimes(input.filePath, seconds, seconds);
});

/** Claude session line: the first record carries the real `cwd`. */
const claudeSessionLine = (cwd: string) =>
  `${JSON.stringify({ type: "user", cwd, sessionId: "s1" })}\n${JSON.stringify({ type: "assistant" })}\n`;

/** Claude transcript with one visible user prompt and one assistant reply. */
const claudeTranscript = (input: {
  readonly cwd: string;
  readonly sessionId: string;
  readonly text: string;
  readonly timestamp: string;
  readonly reply?: string;
}) =>
  `${JSON.stringify({
    type: "user",
    cwd: input.cwd,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    message: { role: "user", content: input.text },
  })}\n${JSON.stringify({
    type: "assistant",
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    message: { role: "assistant", content: [{ type: "text", text: input.reply ?? "Done" }] },
  })}\n`;

const encodeTranscriptRecord = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

function makeRecordLimitTranscript(cwd: string, overflow: boolean): string {
  const records =
    [
      encodeTranscriptRecord({
        type: "user",
        cwd,
        sessionId: "record-limit-session",
        message: { role: "user", content: "First prompt" },
      }),
      encodeTranscriptRecord({ type: "summary" }),
    ].join("\n") +
    "\n" +
    "{}\n".repeat(99_998);
  return overflow
    ? records +
        "\n" +
        encodeTranscriptRecord({
          type: "user",
          message: { role: "user", content: "Overflow prompt" },
        }) +
        "\n"
    : records;
}

it.layer(NodeServices.layer)("AgentSessionScanner", (it) => {
  describe("scan", () => {
    it.effect("reads Claude project cwds from transcripts, newest first", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const olderWorkspace = yield* makeTempDir("t3code-workspace-older-");
        const newerWorkspace = yield* makeTempDir("t3code-workspace-newer-");

        // Slugs are intentionally lossy; the scanner must not decode them.
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-older", "a.jsonl"),
          contents: claudeSessionLine(olderWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-older", "b.jsonl"),
          contents: claudeSessionLine(olderWorkspace),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-newer", "c.jsonl"),
          contents: claudeSessionLine(newerWorkspace),
          mtimeMs: Date.parse("2026-03-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([
          {
            path: newerWorkspace,
            title: path.basename(newerWorkspace),
            sources: ["claudeAgent"],
            threadCount: 1,
            lastActiveAt: "2026-03-01T00:00:00.000Z",
            alreadyImported: false,
            git: null,
          },
          {
            path: olderWorkspace,
            title: path.basename(olderWorkspace),
            sources: ["claudeAgent"],
            threadCount: 2,
            lastActiveAt: "2026-01-02T00:00:00.000Z",
            alreadyImported: false,
            git: null,
          },
        ]);
      }),
    );

    it.effect("does not open a non-file transcript", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const transcriptPath = path.join(claudeHomePath, "projects", "-slug", "session.jsonl");
        yield* fileSystem.makeDirectory(transcriptPath, { recursive: true });

        let transcriptOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (filePath === transcriptPath) transcriptOpenCount += 1;
            return fileSystem.open(filePath, options);
          },
        });

        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(result.candidates).toEqual([]);
        expect(transcriptOpenCount).toBe(0);
      }),
    );

    it.effect("stops directory reads at the discovery operation budget", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const discoveryRoot = path.join(claudeHomePath, "projects");
        const emptyDirectories = Array.from(
          { length: 20_001 },
          (_, index) => `empty-${index.toString().padStart(5, "0")}`,
        );
        let directoryReadCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (directory, options) => {
            if (directory === discoveryRoot) {
              directoryReadCount += 1;
              return Effect.succeed(emptyDirectories);
            }
            if (path.dirname(directory) === discoveryRoot) {
              directoryReadCount += 1;
              return Effect.succeed([]);
            }
            return fileSystem.readDirectory(directory, options);
          },
        });

        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(result.candidates).toEqual([]);
        expect(directoryReadCount).toBe(20_000);
      }),
    );

    it.effect("merges one cwd seen in several transcripts and flags imported projects", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-a", "a.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-b", "b.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-04-01T09:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspace],
        });

        expect(result.candidates).toEqual([
          {
            path: workspace,
            title: path.basename(workspace),
            projectId: ProjectId.make("project-1"),
            sources: ["claudeAgent"],
            threadCount: 2,
            lastActiveAt: "2026-04-01T09:00:00.000Z",
            alreadyImported: true,
            git: null,
          },
        ]);
      }),
    );

    it.effect("returns the imported project ID through a realpath alias", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const linkParent = yield* makeTempDir("t3code-scanner-links-");
        const workspaceAlias = path.join(linkParent, "workspace-alias");
        yield* fileSystem.symlink(workspace, workspaceAlias);

        yield* writeTranscript({
          filePath: path.join(codexHomePath, "sessions", "2026", "01", "01", "rollout-alias.jsonl"),
          contents: codexRolloutLine(workspaceAlias),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspace],
        });

        expect(result.candidates[0]).toMatchObject({
          path: workspace,
          projectId: ProjectId.make("project-1"),
          alreadyImported: true,
          git: null,
        });
      }),
    );

    it.effect("matches a persisted project alias to a transcript realpath", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const linkParent = yield* makeTempDir("t3code-scanner-links-");
        const workspaceAlias = path.join(linkParent, "workspace-alias");
        yield* fileSystem.symlink(workspace, workspaceAlias);

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-realpath.jsonl",
          ),
          contents: codexRolloutLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspaceAlias],
        });

        expect(result.candidates[0]).toMatchObject({
          path: workspaceAlias,
          projectId: ProjectId.make("project-1"),
          alreadyImported: true,
          git: null,
        });
      }),
    );

    it.effect("merges case aliases and preserves the persisted project path", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const workspaceAlias = path.join(
          path.dirname(workspace),
          path.basename(workspace).toUpperCase(),
        );

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-alias", "a.jsonl"),
          contents: claudeSessionLine(workspaceAlias),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-slug-real", "b.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });

        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => fileSystem.stat(filePath === workspaceAlias ? workspace : filePath),
        });
        const result = yield* runScan({
          claudeHomePath,
          importedWorkspaceRoots: [workspace],
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(result.candidates).toEqual([
          {
            path: workspace,
            title: path.basename(workspace),
            projectId: ProjectId.make("project-1"),
            sources: ["claudeAgent"],
            threadCount: 2,
            lastActiveAt: "2026-01-02T00:00:00.000Z",
            alreadyImported: true,
            git: null,
          },
        ]);
      }),
    );

    it.effect("keeps case variants distinct when the filesystem identities differ", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const backingUpper = yield* makeTempDir("t3code-backing-upper-");
        const backingLower = yield* makeTempDir("t3code-backing-lower-");
        const aliasParent = yield* makeTempDir("t3code-case-aliases-");
        const upperWorkspace = path.join(aliasParent, "Repo");
        const lowerWorkspace = path.join(aliasParent, "repo");

        yield* writeTranscript({
          filePath: path.join(codexHomePath, "sessions", "2026", "01", "02", "rollout-upper.jsonl"),
          contents: codexRolloutLine(upperWorkspace),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(codexHomePath, "sessions", "2026", "01", "01", "rollout-lower.jsonl"),
          contents: codexRolloutLine(lowerWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) =>
            fileSystem.stat(
              filePath === upperWorkspace
                ? backingUpper
                : filePath === lowerWorkspace
                  ? backingLower
                  : filePath,
            ),
        });
        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([
          upperWorkspace,
          lowerWorkspace,
        ]);
      }),
    );

    it.effect("uses explicit provider instance homes instead of overridden legacy homes", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-legacy-");
        const claudeInstanceHome = yield* makeTempDir("t3code-claude-instance-");
        const legacyWorkspace = yield* makeTempDir("t3code-workspace-legacy-");
        const claudeWorkspace = yield* makeTempDir("t3code-workspace-claude-");

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-legacy.jsonl",
          ),
          contents: codexRolloutLine(legacyWorkspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(claudeInstanceHome, "projects", "-actual", "session.jsonl"),
          contents: claudeSessionLine(claudeWorkspace),
          mtimeMs: Date.parse("2026-02-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claudeAgent")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: claudeInstanceHome },
            },
          },
        });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([claudeWorkspace]);
      }),
    );

    it.effect("scans each distinct home across multiple instances once", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const firstHome = yield* makeTempDir("t3code-claude-first-");
        const secondHome = yield* makeTempDir("t3code-claude-second-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const otherWorkspace = yield* makeTempDir("t3code-workspace-other-");

        for (const [home, cwd] of [
          [firstHome, workspace],
          [secondHome, otherWorkspace],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(home, "projects", "-slug", "session.jsonl"),
            contents: claudeSessionLine(cwd),
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
          });
        }

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: firstHome },
            },
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: secondHome },
            },
          },
        });

        expect(result.candidates).toHaveLength(2);
        expect(result.candidates.map((candidate) => candidate.threadCount)).toEqual([1, 1]);
        expect(result.candidates.map((candidate) => candidate.path).sort()).toEqual(
          [workspace, otherWorkspace].sort(),
        );
      }),
    );

    it.effect("honors provider instance home directory environment variables", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-legacy-");
        const environmentHome = yield* makeTempDir("t3code-claude-env-");
        const workspace = yield* makeTempDir("t3code-workspace-claude-");

        yield* writeTranscript({
          filePath: path.join(environmentHome, "projects", "-actual", "session.jsonl"),
          contents: claudeSessionLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              environment: [
                { name: "CLAUDE_CONFIG_DIR", value: environmentHome, sensitive: false },
              ],
              config: {},
            },
          },
        });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("ignores invalid provider instances while scanning the remaining providers", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-session.jsonl",
          ),
          contents: codexRolloutLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-broken")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: 123 },
            },
          },
        });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("does not scan provider instances disabled by the envelope or config", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const envelopeDisabledHome = yield* makeTempDir("t3code-claude-disabled-envelope-");
        const configDisabledHome = yield* makeTempDir("t3code-claude-disabled-config-");
        const envelopeWorkspace = yield* makeTempDir("t3code-workspace-disabled-envelope-");
        const configWorkspace = yield* makeTempDir("t3code-workspace-disabled-config-");

        for (const [home, workspace, session] of [
          [envelopeDisabledHome, envelopeWorkspace, "envelope-disabled"],
          [configDisabledHome, configWorkspace, "config-disabled"],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(home, "projects", `-${session}`, `session.jsonl`),
            contents: claudeSessionLine(workspace),
            mtimeMs: Date.parse("2026-08-24T12:00:00.000Z"),
          });
        }

        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("claude-envelope-disabled")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              enabled: false,
              config: { homePath: envelopeDisabledHome },
            },
            [ProviderInstanceId.make("claude-config-disabled")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { enabled: false, homePath: configDisabledHome },
            },
          },
        });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("ignores relative working directories from malformed transcripts", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-relative.jsonl",
          ),
          contents: codexRolloutLine(path.relative(path.resolve(), workspace)),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("drops candidates whose directory no longer exists", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-missing-directory.jsonl",
          ),
          contents: codexRolloutLine(path.join(codexHomePath, "does-not-exist")),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("excludes the home directory, temporary root, and T3 data directory", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const configBaseDir = yield* makeTempDir("t3code-scanner-base-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        for (const [index, cwd] of [
          NodeOS.homedir(),
          NodeOS.tmpdir(),
          configBaseDir,
          workspace,
        ].entries()) {
          yield* writeTranscript({
            filePath: path.join(
              codexHomePath,
              "sessions",
              "2026",
              "01",
              `0${index + 1}`,
              "rollout-session.jsonl",
            ),
            contents: codexRolloutLine(cwd),
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z") + index,
          });
        }

        const result = yield* runScan({ claudeHomePath, configBaseDir });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("excludes T3-managed worktree sandboxes", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const fileSystem = yield* FileSystem.FileSystem;

        const worktreeCwd = path.join(codexHomePath, ".t3", "worktrees", "t3code", "wt-1");
        yield* fileSystem.makeDirectory(worktreeCwd, { recursive: true });
        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-worktree.jsonl",
          ),
          contents: codexRolloutLine(worktreeCwd),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("excludes Downloads directories", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        // The exclusion keys off the real home directory, so these fixtures
        // must live there. Each run owns a uniquely named subtree and removes
        // only that subtree, never the shared Downloads parent.
        const home = NodeOS.homedir();
        // Borrow a unique suffix from a scoped temp dir instead of reaching for
        // Date.now or Math.random, which the Effect lint rejects.
        const runId = path.basename(yield* makeTempDir("t3code-scanner-test-"));
        const downloads = path.join(home, "Downloads", runId);
        const keep = yield* makeTempDir("t3code-workspace-keep-");
        yield* fileSystem.makeDirectory(downloads, { recursive: true });
        yield* Effect.addFinalizer(() =>
          fileSystem.remove(downloads, { recursive: true }).pipe(Effect.ignore),
        );

        for (const [index, cwd] of [downloads, keep].entries()) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", `-slug-${index}`, "session.jsonl"),
            contents: claudeSessionLine(cwd),
            mtimeMs: Date.parse("2026-09-01T00:00:00.000Z"),
          });
        }

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([keep]);
      }),
    );

    it.effect("skips linked git worktrees and reports the origin of real checkouts", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const repo = yield* makeTempDir("t3code-workspace-repo-");
        const worktree = yield* makeTempDir("t3code-workspace-worktree-");
        const plain = yield* makeTempDir("t3code-workspace-plain-");
        const noRemote = yield* makeTempDir("t3code-workspace-noremote-");
        const submodule = yield* makeTempDir("t3code-workspace-submodule-");

        yield* fileSystem.makeDirectory(path.join(repo, ".git"));
        yield* fileSystem.writeFileString(
          path.join(repo, ".git", "config"),
          '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:pingdotgg/t3code.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n',
        );
        yield* fileSystem.writeFileString(
          path.join(worktree, ".git"),
          `gitdir: ${path.join(repo, ".git", "worktrees", "wt")}\n`,
        );
        yield* fileSystem.makeDirectory(path.join(noRemote, ".git"));
        yield* fileSystem.writeFileString(path.join(noRemote, ".git", "config"), "[core]\n");
        // Submodules also use a gitdir pointer, but into `modules/`, not `worktrees/`.
        const submoduleGitDir = path.join(repo, ".git", "modules", "vendor");
        yield* fileSystem.makeDirectory(submoduleGitDir, { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(submoduleGitDir, "config"),
          '[remote "origin"]\n\turl = ssh://github.com/pingdotgg/vendor.git\n',
        );
        yield* fileSystem.writeFileString(
          path.join(submodule, ".git"),
          `gitdir: ${submoduleGitDir}\n`,
        );

        for (const [index, cwd] of [repo, worktree, plain, noRemote, submodule].entries()) {
          yield* writeTranscript({
            filePath: path.join(
              codexHomePath,
              "sessions",
              "2026",
              "01",
              `0${index + 1}`,
              "rollout-session.jsonl",
            ),
            contents: codexRolloutLine(cwd),
            mtimeMs: Date.parse(`2026-01-0${index + 1}T00:00:00.000Z`),
          });
        }

        const result = yield* runScan({ claudeHomePath });

        expect(
          result.candidates.map((candidate) => ({ path: candidate.path, git: candidate.git })),
        ).toEqual([
          {
            path: submodule,
            git: { remoteKey: "github.com/pingdotgg/vendor", repository: "pingdotgg/vendor" },
          },
          { path: noRemote, git: { remoteKey: null, repository: null } },
          { path: plain, git: null },
          {
            path: repo,
            git: { remoteKey: "github.com/pingdotgg/t3code", repository: "pingdotgg/t3code" },
          },
        ]);
      }),
    );

    it.effect("excludes sandboxes under the configured worktrees dir without .t3 in the path", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const configBaseDir = yield* makeTempDir("t3code-scanner-base-");
        const fileSystem = yield* FileSystem.FileSystem;

        // worktreesDir derives as `<baseDir>/worktrees`, and the temp base
        // dir contains no `.t3` segment — only the config-based prefix match
        // can exclude this one.
        const worktreeCwd = path.join(configBaseDir, "worktrees", "t3code", "wt-2");
        yield* fileSystem.makeDirectory(worktreeCwd, { recursive: true });
        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-managed.jsonl",
          ),
          contents: codexRolloutLine(worktreeCwd),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath, configBaseDir });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("excludes sandboxes reached through a symlink into the worktrees dir", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const configBaseDir = yield* makeTempDir("t3code-scanner-base-");
        const linkParent = yield* makeTempDir("t3code-scanner-links-");
        const fileSystem = yield* FileSystem.FileSystem;

        // The recorded cwd is a symlink whose own spelling looks harmless;
        // only its realpath reveals the managed sandbox.
        const worktreeCwd = path.join(configBaseDir, "worktrees", "t3code", "wt-3");
        yield* fileSystem.makeDirectory(worktreeCwd, { recursive: true });
        const symlinkCwd = path.join(linkParent, "innocent-project");
        yield* fileSystem.symlink(worktreeCwd, symlinkCwd);
        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-symlink.jsonl",
          ),
          contents: codexRolloutLine(symlinkCwd),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath, configBaseDir });

        expect(result.candidates).toEqual([]);
      }),
    );

    it.effect("finds the cwd on a later line when the first records carry none", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        // Codex rollouts can open with records that carry no cwd.
        const contents = [
          encodeTranscriptRecord({ type: "event_msg", payload: { type: "agent_reasoning" } }),
          encodeTranscriptRecord({ type: "turn_context", payload: { model: "gpt-5.4" } }),
          codexRolloutLine(workspace).trim(),
        ].join("\n");
        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-later-line.jsonl",
          ),
          contents,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("reads a complete transcript record at the exact chunk boundary", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const record = codexRolloutLine(workspace).trim();
        const prefix = '{"padding":"';
        const suffix = `",${record.slice(1)}`;
        const contents = `${prefix}${"x".repeat(32 * 1024 - prefix.length - suffix.length)}${suffix}`;

        yield* writeTranscript({
          filePath: path.join(codexHomePath, "sessions", "2026", "01", "01", "rollout-exact.jsonl"),
          contents,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(contents).toHaveLength(32 * 1024);
        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect("finds session metadata after a first record larger than one chunk", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const history = `{"type":"event_msg","payload":{"type":"agent_reasoning","text":"${"x".repeat(32 * 1024)}"}}\n`;

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "01",
            "01",
            "rollout-large-record.jsonl",
          ),
          contents: `${history}${codexRolloutLine(workspace)}`,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
      }),
    );

    it.effect.each([64, 65])("shares metadata bytes across homes for %s one-MiB files", (count) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-metadata-home-");
        const secondHome = yield* makeTempDir("t3code-metadata-second-");
        const firstWorkspace = yield* makeTempDir("t3code-metadata-first-project-");
        const secondWorkspace = yield* makeTempDir("t3code-metadata-second-project-");
        const directories = [
          path.join(codexHomePath, "sessions", "2026", "01", "01"),
          path.join(secondHome, "sessions", "2026", "01", "01"),
        ];
        const templates = directories.map((directory) => path.join(directory, "template.jsonl"));
        for (const [index, workspace] of [firstWorkspace, secondWorkspace].entries()) {
          const record = encodeTranscriptRecord({ cwd: workspace });
          yield* writeTranscript({
            filePath: templates[index]!,
            contents:
              " ".repeat(1024 * 1024 - new TextEncoder().encode(record).byteLength) + record,
            mtimeMs: Date.parse("2026-01-01T00:00:00.000Z") - index * 1_000,
          });
        }
        const resolveFile = (filePath: string) => {
          const index = directories.indexOf(path.dirname(filePath));
          return index === -1 ? filePath : templates[index]!;
        };
        let reservedBytes = 0;
        let opens = 0;
        const requests: number[] = [];
        const observedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (directory, options) => {
            const index = directories.indexOf(directory);
            return index === -1
              ? fileSystem.readDirectory(directory, options)
              : Effect.succeed(
                  Array.from(
                    { length: index === 0 ? 32 : count - 32 },
                    (_, item) => `rollout-${item}.jsonl`,
                  ),
                );
          },
          stat: (filePath) => fileSystem.stat(resolveFile(filePath)),
          open: (filePath, options) => {
            if (!directories.includes(path.dirname(filePath)))
              return fileSystem.open(filePath, options);
            opens += 1;
            return fileSystem.open(resolveFile(filePath), options).pipe(
              Effect.map((file) => ({
                ...file,
                stat: file.stat,
                readAlloc: (size: FileSystem.SizeInput) => {
                  reservedBytes += Number(size);
                  requests.push(Number(size));
                  return file.readAlloc(size);
                },
              })),
            );
          },
        });
        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("codex-work")]: {
              driver: ProviderDriverKind.make("codex"),
              config: { homePath: secondHome },
            },
          },
        }).pipe(Effect.provideService(FileSystem.FileSystem, observedFileSystem));
        expect(result.candidates.map((candidate) => candidate.path)).toEqual([
          firstWorkspace,
          secondWorkspace,
        ]);
        expect(result.candidates.map((candidate) => candidate.threadCount)).toEqual([32, 32]);
        expect(result.truncated).toBe(count === 65 ? true : undefined);
        expect(opens).toBe(64);
        expect(reservedBytes).toBe(64 * 1024 * 1024);
        expect(requests[0]).toBe(8 * 1024);
        expect(Math.max(...requests)).toBe(8 * 1024);
      }),
    );

    it.effect.each([50, 51])("bounds metadata open/read calls for %s short-read files", (count) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-short-metadata-home-");
        const workspace = yield* makeTempDir("t3code-short-metadata-project-");
        const directory = path.join(codexHomePath, "sessions", "2026", "01", "01");
        const template = path.join(directory, "template.jsonl");
        const record = encodeTranscriptRecord({ cwd: workspace });
        const contents = " ".repeat(399 - new TextEncoder().encode(record).byteLength) + record;
        const bytes = new TextEncoder().encode(contents);
        yield* writeTranscript({
          filePath: template,
          contents,
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        let operations = 0;
        const observedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (target, options) =>
            target === directory
              ? Effect.succeed(
                  Array.from({ length: count }, (_, index) => `rollout-${index}.jsonl`),
                )
              : fileSystem.readDirectory(target, options),
          stat: (filePath) =>
            fileSystem.stat(path.dirname(filePath) === directory ? template : filePath),
          open: (filePath, options) => {
            if (path.dirname(filePath) !== directory) return fileSystem.open(filePath, options);
            operations += 1;
            let offset = 0;
            return fileSystem.open(template, options).pipe(
              Effect.map((file) => ({
                ...file,
                stat: file.stat,
                readAlloc: () =>
                  Effect.sync(() => {
                    operations += 1;
                    if (offset === bytes.length) return Option.none<Uint8Array>();
                    return Option.some(bytes.subarray(offset, ++offset));
                  }),
              })),
            );
          },
        });
        const result = yield* runScan({ claudeHomePath }).pipe(
          Effect.provideService(FileSystem.FileSystem, observedFileSystem),
        );
        expect(operations).toBe(20_000);
        expect(result.candidates[0]?.threadCount).toBe(50);
        expect(result.truncated).toBe(count === 51 ? true : undefined);
      }),
    );

    it.effect("bounds malformed metadata records without excluding another account", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const claudeHomePath = yield* makeTempDir("t3code-record-metadata-home-");
        const secondHome = yield* makeTempDir("t3code-record-metadata-second-");
        const workspace = yield* makeTempDir("t3code-record-metadata-project-");
        const directory = path.join(codexHomePath, "sessions", "2026", "01", "01");
        const template = path.join(directory, "template.jsonl");
        yield* writeTranscript({
          filePath: template,
          contents: "x\n".repeat(1_001),
          mtimeMs: Date.parse("2026-01-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(secondHome, "sessions", "2026", "01", "01", "rollout-session.jsonl"),
          contents: codexRolloutLine(workspace),
          mtimeMs: Date.parse("2026-01-01T00:00:00.000Z"),
        });
        let malformedOpens = 0;
        const observedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (target, options) =>
            target === directory
              ? Effect.succeed(Array.from({ length: 102 }, (_, index) => `rollout-${index}.jsonl`))
              : fileSystem.readDirectory(target, options),
          stat: (filePath) =>
            fileSystem.stat(path.dirname(filePath) === directory ? template : filePath),
          open: (filePath, options) => {
            if (path.dirname(filePath) !== directory) return fileSystem.open(filePath, options);
            malformedOpens += 1;
            return fileSystem.open(template, options);
          },
        });
        const result = yield* runScan({
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("codex-work")]: {
              driver: ProviderDriverKind.make("codex"),
              config: { homePath: secondHome },
            },
          },
        }).pipe(Effect.provideService(FileSystem.FileSystem, observedFileSystem));
        expect(result.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
        expect(malformedOpens).toBe(100);
        expect(result.truncated).toBe(true);
      }),
    );

    it.effect.each([19_999, 20_000])(
      "reports unfinished directory work for %s session date directories",
      (count) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const fileSystem = yield* FileSystem.FileSystem;
          const claudeHomePath = yield* makeTempDir("t3code-directory-budget-home-");
          const projectsDir = path.join(claudeHomePath, "projects");
          let reads = 0;
          const observedFileSystem = FileSystem.FileSystem.of({
            ...fileSystem,
            readDirectory: (directory, options) => {
              if (directory === sessionsDir) {
                reads += 1;
                return Effect.succeed(Array.from({ length: count }, (_, index) => `year-${index}`));
              }
              if (path.dirname(directory) === sessionsDir) {
                reads += 1;
                return Effect.succeed([]);
              }
              return fileSystem.readDirectory(directory, options);
            },
          });
          const result = yield* runScan({ claudeHomePath }).pipe(
            Effect.provideService(FileSystem.FileSystem, observedFileSystem),
          );
          expect(reads).toBe(20_000);
          expect(result.candidates).toEqual([]);
          expect(result.truncated).toBe(count === 20_000 ? true : undefined);
        }),
    );

    it.effect("skips malformed transcripts without failing the scan", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "05",
            "01",
            "rollout-broken.jsonl",
          ),
          contents: "not json at all\n",
          mtimeMs: Date.parse("2026-05-01T00:00:00.000Z"),
        });
        // Valid JSON, but no cwd anywhere in the record.
        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "05",
            "02",
            "rollout-no-cwd.jsonl",
          ),
          contents: `${encodeTranscriptRecord({
            type: "event_msg",
            payload: { type: "agent_reasoning" },
          })}\n`,
          mtimeMs: Date.parse("2026-05-02T00:00:00.000Z"),
        });
        yield* writeTranscript({
          filePath: path.join(codexHomePath, "sessions", "2026", "05", "03", "rollout-good.jsonl"),
          contents: codexRolloutLine(workspace),
          mtimeMs: Date.parse("2026-05-03T00:00:00.000Z"),
        });

        const result = yield* runScan({ claudeHomePath });

        expect(result.candidates).toEqual([
          {
            path: workspace,
            title: path.basename(workspace),
            sources: ["codex"],
            threadCount: 1,
            lastActiveAt: "2026-05-03T00:00:00.000Z",
            alreadyImported: false,
            git: null,
          },
        ]);
      }),
    );

    it.effect("returns an empty result when the home directory does not exist", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = yield* makeTempDir("t3code-missing-home-");

        const result = yield* runScan({ claudeHomePath: path.join(root, "no-claude") });

        expect(result.candidates).toEqual([]);
        expect(result.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }),
    );
  });

  describe("recentThreads", () => {
    it.effect.each([false, true])(
      "counts terminal newlines correctly with record overflow=%s",
      (overflow) =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
          yield* TestClock.setTime(nowMs);
          const claudeHomePath = yield* makeTempDir("t3code-record-limit-claude-");
          const workspace = yield* makeTempDir("t3code-record-limit-project-");
          const directory = path.join(claudeHomePath, "projects", "-records");
          yield* writeTranscript({
            filePath: path.join(directory, "records.jsonl"),
            contents: makeRecordLimitTranscript(workspace, overflow),
            mtimeMs: nowMs,
          });
          yield* writeTranscript({
            filePath: path.join(directory, "older.jsonl"),
            contents: claudeTranscript({
              cwd: workspace,
              sessionId: "older-session",
              text: "Older prompt",
              timestamp: "2026-08-24T10:00:00.000Z",
            }),
            mtimeMs: nowMs - 1_000,
          });
          const outcomes = yield* runRecentThreadOutcomes({
            claudeHomePath,
            workspaceRoot: workspace,
          });
          expect(outcomes.map((outcome) => outcome._tag)).toEqual(
            overflow ? ["Skipped", "Importable"] : ["Importable", "Skipped"],
          );
          expect(
            outcomes.flatMap((outcome) =>
              outcome._tag === "Importable"
                ? outcome.thread.messages.map((message) => message.text)
                : [],
            ),
          ).toEqual(overflow ? ["Older prompt", "Done"] : ["First prompt"]);
        }),
    );

    it.effect("imports recent sessions for the selected project only", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const otherWorkspace = yield* makeTempDir("t3code-workspace-other-");

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-selected", "claude-recent.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "claude-recent",
            text: "Fix the project",
            timestamp: "2026-08-23T12:00:00.000Z",
          }),
          mtimeMs: nowMs - 24 * 60 * 60 * 1000,
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-selected", "claude-old.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "claude-old",
            text: "Old prompt",
            timestamp: "2026-08-23T12:00:00.000Z",
          }),
          mtimeMs: nowMs - 31 * 24 * 60 * 60 * 1000,
        });
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-other", "claude-other.jsonl"),
          contents: claudeTranscript({
            cwd: otherWorkspace,
            sessionId: "claude-other",
            text: "Other prompt",
            timestamp: "2026-08-23T12:00:00.000Z",
          }),
          mtimeMs: nowMs - 24 * 60 * 60 * 1000,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(threads.map((thread) => thread.providerSessionId)).toEqual(["claude-recent"]);
        expect(threads.map((thread) => thread.messages.map((message) => message.text))).toEqual([
          ["Fix the project", "Done"],
        ]);
      }),
    );

    it.effect("imports history recorded with a case alias", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const workspaceAlias = path.join(
          path.dirname(workspace),
          path.basename(workspace).toUpperCase(),
        );

        yield* writeTranscript({
          filePath: path.join(
            codexHomePath,
            "sessions",
            "2026",
            "08",
            "24",
            "rollout-case-session.jsonl",
          ),
          contents: [
            encodeTranscriptRecord({
              type: "session_meta",
              payload: { id: "case-session", cwd: workspaceAlias },
            }),
            encodeTranscriptRecord({
              type: "event_msg",
              timestamp: "2026-08-24T10:00:00.000Z",
              payload: { type: "user_message", message: "Import case alias history" },
            }),
          ].join("\n"),
          mtimeMs: nowMs,
        });

        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => fileSystem.stat(filePath === workspaceAlias ? workspace : filePath),
        });
        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(threads.map((thread) => thread.providerSessionId)).toEqual(["case-session"]);
      }),
    );

    it.effect("keeps the provider instance that owns a custom session home", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const customHome = yield* makeTempDir("t3code-claude-custom-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(customHome, "projects", "-custom", "custom.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "custom-session",
            text: "Use my work account",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: customHome },
            },
          },
        });

        expect(threads[0]?.providerInstanceId).toBe("claude-work");
      }),
    );

    it.effect("suppresses duplicate session copies without reporting a skipped import", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const contents = claudeTranscript({
          cwd: workspace,
          sessionId: "copied-session",
          text: "Import this session once",
          timestamp: "2026-08-24T10:00:00.000Z",
        });

        for (const [name, mtimeMs] of [
          ["copy-a.jsonl", nowMs],
          ["copy-b.jsonl", nowMs - 1],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", "-copy", name),
            contents,
            mtimeMs,
          });
        }

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(outcomes.map((outcome) => outcome._tag)).toEqual(["Importable", "Duplicate"]);
        expect(outcomes[0]).toMatchObject({
          _tag: "Importable",
          thread: { providerSessionId: "copied-session" },
        });
      }),
    );

    it.effect("streams large transcripts without hiding projects", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-budget-claude-");
        const workspace = yield* makeTempDir("t3code-budget-workspace-");
        const transcriptPaths = new Set<string>();
        for (const index of [0, 1, 2, 3, 4]) {
          const sessionId = `budget-session-${index}`;
          const filePath = path.join(claudeHomePath, "projects", "selected", `${sessionId}.jsonl`);
          const contents = encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId,
            message: { content: "Imported prompt" },
          });
          transcriptPaths.add(filePath);
          yield* writeTranscript({
            filePath,
            contents: `${contents}\n`.padEnd(16 * 1024 * 1024, " "),
            mtimeMs: nowMs - index * 1_000,
          });
        }

        const opens = new Map<string, number>();
        let fullReadBytes = 0;
        const trackedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            const count = (opens.get(filePath) ?? 0) + 1;
            opens.set(filePath, count);
            return fileSystem.open(filePath, options).pipe(
              Effect.map((file) =>
                !transcriptPaths.has(filePath) || count === 1
                  ? file
                  : {
                      ...file,
                      stat: file.stat,
                      readAlloc: (size: FileSystem.SizeInput) =>
                        file.readAlloc(size).pipe(
                          Effect.tap((chunk) =>
                            Effect.sync(() => {
                              if (chunk._tag === "Some") fullReadBytes += chunk.value.byteLength;
                            }),
                          ),
                        ),
                    },
              ),
            );
          },
        });
        const outcomes = yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          const scan = yield* scanner.scan;
          expect(scan.candidates[0]?.threadCount).toBe(5);
          return yield* scanner.recentThreads(workspace).pipe(Stream.runCollect);
        }).pipe(
          Effect.provide(makeScannerTestLayer({ claudeHomePath })),
          Effect.provideService(FileSystem.FileSystem, trackedFileSystem),
        );

        expect(outcomes.map((outcome) => outcome._tag)).toEqual([
          "Importable",
          "Importable",
          "Importable",
          "Importable",
          "Importable",
        ]);
        expect(fullReadBytes).toBe(80 * 1024 * 1024);
      }),
    );

    it.effect("skips excessive records without blocking an older valid transcript", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-record-budget-claude-");
        const workspace = yield* makeTempDir("t3code-record-budget-workspace-");
        for (const [sessionId, padding, mtimeMs] of [
          ["excessive", "\n".repeat(100_001), nowMs],
          ["older", "", nowMs - 1_000],
        ] as const) {
          yield* writeTranscript({
            filePath: path.join(claudeHomePath, "projects", "p", `${sessionId}.jsonl`),
            contents:
              claudeTranscript({
                cwd: workspace,
                sessionId,
                text: "Imported prompt",
                timestamp: "2026-08-24T10:00:00.000Z",
              }) + padding,
            mtimeMs,
          });
        }
        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });
        expect(outcomes.map((outcome) => outcome._tag)).toEqual(["Skipped", "Importable"]);
        expect(outcomes[1]).toMatchObject({ thread: { providerSessionId: "older" } });
      }),
    );

    for (const replacement of [
      "same root",
      "other root",
      "symlink alias",
      "other then same",
    ] as const) {
      it.effect.skipIf(replacement === "symlink alias" && !symlinksSupported)(
        `rechecks the snapshot cwd after replacement with ${replacement}`,
        () =>
          Effect.gen(function* () {
            const path = yield* Path.Path;
            const fileSystem = yield* FileSystem.FileSystem;
            const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
            yield* TestClock.setTime(nowMs);
            const fixture = yield* makeTempDir("t3code-replaced-cwd-");
            const workspace = path.join(fixture, "original");
            const otherWorkspace = path.join(fixture, "other");
            const alias = path.join(fixture, "alias");
            const claudeHomePath = path.join(fixture, "claude");
            yield* fileSystem.makeDirectory(workspace);
            yield* fileSystem.makeDirectory(otherWorkspace);
            if (replacement === "symlink alias") yield* fileSystem.symlink(workspace, alias);
            const filePath = path.join(claudeHomePath, "projects", "p", "replaced.jsonl");
            const makeContents = (cwd: string, text: string, laterCwd?: string) =>
              [
                {
                  type: "user",
                  cwd,
                  sessionId: "replacement-session",
                  message: { content: text },
                },
                ...(laterCwd === undefined ? [] : [{ cwd: laterCwd }]),
              ]
                .map((record) => encodeTranscriptRecord(record))
                .join("\n");
            yield* writeTranscript({
              filePath,
              contents: makeContents(workspace, "Original prompt"),
              mtimeMs: nowMs,
            });

            yield* Effect.gen(function* () {
              const scanner = yield* AgentSessionScanner.AgentSessionScanner;
              const scan = yield* scanner.scan;
              expect(scan.candidates.map((candidate) => candidate.path)).toEqual([workspace]);
              const replacementCwd =
                replacement === "symlink alias"
                  ? alias
                  : replacement === "same root"
                    ? workspace
                    : otherWorkspace;
              yield* fileSystem.remove(filePath);
              yield* writeTranscript({
                filePath,
                contents: makeContents(
                  replacementCwd,
                  "Replacement prompt",
                  replacement === "other then same" ? workspace : undefined,
                ),
                mtimeMs: nowMs,
              });
              const outcomes = yield* scanner.recentThreads(workspace).pipe(Stream.runCollect);
              if (replacement === "same root" || replacement === "symlink alias") {
                expect(outcomes).toHaveLength(1);
                expect(outcomes[0]).toMatchObject({
                  _tag: "Importable",
                  thread: { messages: [{ text: "Replacement prompt" }] },
                });
              } else {
                expect(outcomes).toEqual([{ _tag: "Skipped" }]);
              }
            }).pipe(Effect.provide(makeScannerTestLayer({ claudeHomePath })));
          }),
      );
    }

    it.effect("checks file identity before skipping completed history", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-completed-claude-");
        const workspace = yield* makeTempDir("t3code-completed-workspace-");
        const filePath = path.join(claudeHomePath, "projects", "p", "replaced.jsonl");
        const contents = (sessionId: string) =>
          claudeTranscript({
            cwd: workspace,
            sessionId,
            text: "Imported prompt",
            timestamp: "2026-08-24T10:00:00.000Z",
          });
        yield* writeTranscript({
          filePath,
          contents: contents("original-session"),
          mtimeMs: nowMs,
        });

        yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          const initial = yield* scanner.recentThreads(workspace).pipe(Stream.runCollect);
          const imported = initial[0];
          expect(imported?._tag).toBe("Importable");
          if (imported?._tag !== "Importable") return;
          const completed = yield* scanner
            .recentThreads(workspace, [imported.source])
            .pipe(Stream.runCollect);
          expect(completed[0]?._tag).toBe("AlreadyImported");

          // Keep the old inode allocated while replacing the path with an equal-size file.
          yield* fileSystem.open(filePath);
          yield* fileSystem.remove(filePath);
          yield* writeTranscript({
            filePath,
            contents: contents("replaced-session"),
            mtimeMs: nowMs,
          });
          const replaced = yield* scanner
            .recentThreads(workspace, [imported.source])
            .pipe(Stream.runCollect);
          expect(replaced[0]).toMatchObject({
            _tag: "Importable",
            thread: { providerSessionId: "replaced-session" },
            source: { size: imported.source.size, mtimeMs: imported.source.mtimeMs },
          });
        }).pipe(Effect.provide(makeScannerTestLayer({ claudeHomePath })));
      }),
    );

    it.effect("imports visible history from a transcript with an oversized tool record", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const transcript = `${[
          encodeTranscriptRecord({
            type: "user",
            cwd: workspace,
            sessionId: "large-session",
            message: { role: "user", content: "Import this large session" },
          }),
        ].join("\n")}\n${encodeTranscriptRecord({ type: "tool_result", data: "" }).padEnd(
          16 * 1024 * 1024 + 1,
          " ",
        )}`;
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "-large", "rollout-large.jsonl"),
          contents: transcript,
          mtimeMs: nowMs,
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(outcomes).toMatchObject([
          {
            _tag: "Importable",
            thread: {
              providerSessionId: "large-session",
              messages: [{ role: "user", text: "Import this large session" }],
            },
          },
        ]);
      }),
    );

    it.effect("reports stat, read, and parse failures as skipped", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const missingPath = path.join(claudeHomePath, "missing.jsonl");
        const directory = path.join(claudeHomePath, "projects", "p");
        const transcriptPaths = {
          stat: path.join(directory, "stat.jsonl"),
          read: path.join(directory, "read.jsonl"),
          parse: path.join(directory, "parse.jsonl"),
        };
        const transcriptContents = (sessionId: string) =>
          claudeTranscript({
            cwd: workspace,
            sessionId,
            text: "Import this session",
            timestamp: "2026-08-24T10:00:00.000Z",
          });

        yield* writeTranscript({
          filePath: transcriptPaths.stat,
          contents: transcriptContents("stat-session"),
          mtimeMs: nowMs,
        });
        yield* writeTranscript({
          filePath: transcriptPaths.read,
          contents: transcriptContents("read-session"),
          mtimeMs: nowMs,
        });
        yield* writeTranscript({
          filePath: transcriptPaths.parse,
          // Discoverable by cwd, but it carries nothing importable: the record
          // parses and still yields no thread.
          contents: encodeTranscriptRecord({ type: "summary", cwd: workspace }),
          mtimeMs: nowMs,
        });

        let statCount = 0;
        let readOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => {
            if (filePath !== transcriptPaths.stat) return fileSystem.stat(filePath);
            statCount += 1;
            return fileSystem.stat(statCount === 1 ? filePath : missingPath);
          },
          open: (filePath, options) => {
            if (filePath !== transcriptPaths.read) return fileSystem.open(filePath, options);
            readOpenCount += 1;
            return fileSystem.open(readOpenCount === 1 ? filePath : missingPath, options);
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(outcomes).toEqual([{ _tag: "Skipped" }, { _tag: "Skipped" }, { _tag: "Skipped" }]);
      }),
    );

    it.effect("does not reopen a transcript that becomes a non-file after discovery", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const nonFilePath = yield* makeTempDir("t3code-non-file-");
        const transcriptPath = path.join(claudeHomePath, "projects", "p", "changed.jsonl");
        yield* writeTranscript({
          filePath: transcriptPath,
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "changed-session",
            text: "Do not import this session",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs,
        });

        let transcriptStatCount = 0;
        let transcriptOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          stat: (filePath) => {
            if (filePath !== transcriptPath) return fileSystem.stat(filePath);
            transcriptStatCount += 1;
            return fileSystem.stat(transcriptStatCount === 1 ? transcriptPath : nonFilePath);
          },
          open: (filePath, options) => {
            if (filePath === transcriptPath) transcriptOpenCount += 1;
            return fileSystem.open(filePath, options);
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(transcriptStatCount).toBe(2);
        expect(transcriptOpenCount).toBe(1);
        expect(outcomes).toEqual([{ _tag: "Skipped" }]);
      }),
    );

    it.effect("does not import a transcript dated after the current time", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "p", "future.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "future-session",
            text: "Future work",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs + 1,
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        });

        expect(outcomes).toEqual([]);
      }),
    );

    it.effect("skips growth during reading without exceeding the reserved bytes", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const transcriptPath = path.join(claudeHomePath, "projects", "p", "growing.jsonl");
        const contents = claudeTranscript({
          cwd: workspace,
          sessionId: "growing-session",
          text: "Do not import a changing file",
          timestamp: "2026-08-24T10:00:00.000Z",
        });
        yield* writeTranscript({ filePath: transcriptPath, contents, mtimeMs: nowMs });
        let transcriptOpenCount = 0;
        let fullReadBytes = 0;
        let grew = false;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (filePath !== transcriptPath) return fileSystem.open(filePath, options);
            transcriptOpenCount += 1;
            if (transcriptOpenCount === 1) return fileSystem.open(filePath, options);
            return fileSystem.open(filePath, options).pipe(
              Effect.map((file) => ({
                ...file,
                stat: file.stat,
                readAlloc: (size: FileSystem.SizeInput) =>
                  file.readAlloc(size).pipe(
                    Effect.tap((chunk) =>
                      Effect.gen(function* () {
                        if (chunk._tag === "None") return;
                        fullReadBytes += chunk.value.byteLength;
                        if (!grew) {
                          grew = true;
                          yield* fileSystem.writeFileString(filePath, `${contents}\nchanged`);
                        }
                      }),
                    ),
                  ),
              })),
            );
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(transcriptOpenCount).toBe(2);
        expect(fullReadBytes).toBe(new TextEncoder().encode(contents).byteLength);
        expect(outcomes).toEqual([{ _tag: "Skipped" }]);
      }),
    );

    it.effect("skips a transcript that shrinks after its size check", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const transcriptPath = path.join(claudeHomePath, "projects", "p", "shrinking.jsonl");
        const shrunkPath = path.join(claudeHomePath, "shrunk.jsonl");
        const contents = claudeTranscript({
          cwd: workspace,
          sessionId: "shrinking-session",
          text: "Do not import a changing file",
          timestamp: "2026-08-24T10:00:00.000Z",
        });
        yield* writeTranscript({
          filePath: transcriptPath,
          contents: `${contents}\n${"padding".repeat(100)}`,
          mtimeMs: nowMs,
        });
        yield* writeTranscript({ filePath: shrunkPath, contents, mtimeMs: nowMs });

        let transcriptOpenCount = 0;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (filePath !== transcriptPath) return fileSystem.open(filePath, options);
            transcriptOpenCount += 1;
            return fileSystem.open(
              transcriptOpenCount === 1 ? transcriptPath : shrunkPath,
              options,
            );
          },
        });

        const outcomes = yield* runRecentThreadOutcomes({
          claudeHomePath,
          workspaceRoot: workspace,
        }).pipe(Effect.provideService(FileSystem.FileSystem, simulatedFileSystem));

        expect(transcriptOpenCount).toBe(2);
        expect(outcomes).toEqual([{ _tag: "Skipped" }]);
      }),
    );

    it.effect("does not read the second transcript when the consumer takes one thread", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const workspace = yield* makeTempDir("t3code-workspace-");
        const olderPath = path.join(claudeHomePath, "projects", "p", "older.jsonl");
        const newerPath = path.join(claudeHomePath, "projects", "p", "newer.jsonl");
        yield* writeTranscript({
          filePath: olderPath,
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "older-session",
            text: "Older prompt",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs - 1_000,
        });
        yield* writeTranscript({
          filePath: newerPath,
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "newer-session",
            text: "Newer prompt",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs,
        });

        const openCounts = new Map<string, number>();
        const contentReads: Array<string> = [];
        const trackedPaths = new Set([olderPath, newerPath]);
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          open: (filePath, options) => {
            if (trackedPaths.has(filePath)) {
              const count = (openCounts.get(filePath) ?? 0) + 1;
              openCounts.set(filePath, count);
              if (count === 2) contentReads.push(filePath);
            }
            return fileSystem.open(filePath, options);
          },
        });

        const threads = yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          return yield* scanner.recentThreads(workspace).pipe(
            Stream.take(1),
            Stream.runCollect,
            Effect.map((items) => Array.from(items)),
          );
        }).pipe(
          Effect.provide(makeScannerTestLayer({ claudeHomePath })),
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(
          threads.flatMap((outcome) =>
            outcome._tag === "Importable" ? [outcome.thread.providerSessionId] : [],
          ),
        ).toEqual(["newer-session"]);
        expect(contentReads).toEqual([newerPath]);
        expect(openCounts.get(olderPath)).toBe(1);
      }),
    );

    it.effect("does not import sessions from a T3-managed worktree", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const configBaseDir = yield* makeTempDir("t3code-scanner-base-");
        const workspace = path.join(configBaseDir, "worktrees", "t3code", "managed-worktree");
        yield* fileSystem.makeDirectory(workspace, { recursive: true });

        yield* writeTranscript({
          filePath: path.join(claudeHomePath, "projects", "p", "managed.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "managed-session",
            text: "Do not import this session",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          configBaseDir,
          workspaceRoot: workspace,
        });

        expect(threads).toEqual([]);
      }),
    );

    it.effect("uses one deterministic provider instance for a shared session home", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const sharedHome = yield* makeTempDir("t3code-claude-shared-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(sharedHome, "projects", "p", "shared.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "shared-session",
            text: "Use the shared session",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath: sharedHome,
          workspaceRoot: workspace,
          providerInstances: {
            [ProviderInstanceId.make("claudeAgent")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
          },
        });

        expect(threads.map((thread) => thread.providerInstanceId)).toEqual(["claudeAgent"]);
      }),
    );

    it.effect("uses configured order when custom instances share a session home", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const sharedHome = yield* makeTempDir("t3code-claude-shared-");
        const workspace = yield* makeTempDir("t3code-workspace-");

        yield* writeTranscript({
          filePath: path.join(sharedHome, "projects", "p", "shared.jsonl"),
          contents: claudeTranscript({
            cwd: workspace,
            sessionId: "shared-session",
            text: "Use the first account",
            timestamp: "2026-08-24T10:00:00.000Z",
          }),
          mtimeMs: nowMs,
        });

        const threads = yield* runRecentThreads({
          claudeHomePath,
          workspaceRoot: workspace,
          providerInstances: {
            [ProviderInstanceId.make("claude-work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
            [ProviderInstanceId.make("claude-personal")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              config: { homePath: sharedHome },
            },
          },
        });

        expect(threads.map((thread) => thread.providerInstanceId)).toEqual(["claude-work"]);
      }),
    );

    it.effect("keeps a second account when the first has 5000 newer files", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fileSystem = yield* FileSystem.FileSystem;
        const nowMs = Date.parse("2026-08-24T12:00:00.000Z");
        yield* TestClock.setTime(nowMs);
        const claudeHomePath = yield* makeTempDir("t3code-claude-home-");
        const oldWorkspace = yield* makeTempDir("t3code-workspace-old-");
        const recentWorkspace = yield* makeTempDir("t3code-workspace-recent-");
        const recentHome = yield* makeTempDir("t3code-codex-recent-home-");
        const oldDirectory = path.join(codexHomePath, "sessions", "2026", "08", "24");
        const oldTranscript = path.join(oldDirectory, "rollout-old-template.jsonl");
        const recentDirectory = path.join(recentHome, "sessions", "2026", "08", "24");

        yield* writeTranscript({
          filePath: oldTranscript,
          contents: [
            encodeTranscriptRecord({
              type: "session_meta",
              payload: { id: "old-session", cwd: oldWorkspace },
            }),
            encodeTranscriptRecord({
              type: "event_msg",
              payload: { type: "user_message", message: "Old work" },
            }),
          ].join("\n"),
          mtimeMs: nowMs,
        });
        yield* writeTranscript({
          filePath: path.join(recentDirectory, "rollout-recent.jsonl"),
          contents: [
            encodeTranscriptRecord({
              type: "session_meta",
              payload: { id: "recent-session", cwd: recentWorkspace },
            }),
            encodeTranscriptRecord({
              type: "event_msg",
              payload: { type: "user_message", message: "Recent work" },
            }),
          ].join("\n"),
          mtimeMs: nowMs - 1_000,
        });

        const simulatedOldTranscripts = Array.from(
          { length: 5_000 },
          (_, index) => `rollout-old-${index}.jsonl`,
        );
        const resolveTranscript = (filePath: string) =>
          path.dirname(filePath) === oldDirectory &&
          path.basename(filePath).startsWith("rollout-old-")
            ? oldTranscript
            : filePath;
        const simulatedFileSystem = FileSystem.FileSystem.of({
          ...fileSystem,
          readDirectory: (directory, options) =>
            directory === oldDirectory
              ? Effect.succeed(simulatedOldTranscripts)
              : fileSystem.readDirectory(directory, options),
          stat: (filePath) => fileSystem.stat(resolveTranscript(filePath)),
          open: (filePath, options) => fileSystem.open(resolveTranscript(filePath), options),
        });

        const input = {
          claudeHomePath,
          providerInstances: {
            [ProviderInstanceId.make("codex-work")]: {
              driver: ProviderDriverKind.make("codex"),
              config: { homePath: recentHome },
            },
          },
        };
        const threads = yield* Effect.gen(function* () {
          const scanner = yield* AgentSessionScanner.AgentSessionScanner;
          const scan = yield* scanner.scan;
          expect(scan.truncated).toBe(true);
          return yield* scanner.recentThreads(recentWorkspace).pipe(Stream.runCollect);
        }).pipe(
          Effect.provide(makeScannerTestLayer(input)),
          Effect.provideService(FileSystem.FileSystem, simulatedFileSystem),
        );

        expect(
          threads.flatMap((outcome) =>
            outcome._tag === "Importable" ? [outcome.thread.providerSessionId] : [],
          ),
        ).toEqual(["recent-session"]);
      }),
    );
  });
});

describe("parseAgentSessionTranscript", () => {
  it.each([false, true])(
    "handles the exact record limit and an interior blank overflow=%s",
    (overflow) => {
      const thread = AgentSessionScanner.parseAgentSessionTranscript({
        contents: makeRecordLimitTranscript("/project", overflow),
        source: "claudeAgent",
        providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        fallbackSessionId: "unused",
        lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
      });
      if (overflow) expect(thread).toBeNull();
      else expect(thread?.messages.map((message) => message.text)).toEqual(["First prompt"]);
    },
  );

  it("keeps Claude text and titles while dropping malformed and tool records", () => {
    const thread = AgentSessionScanner.parseAgentSessionTranscript({
      contents: [
        "not valid json",
        JSON.stringify({ type: "ai-title", aiTitle: "Fix authentication" }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          isMeta: true,
          message: { role: "user", content: "Injected skill instructions" },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          isCompactSummary: true,
          message: { role: "user", content: "Injected compaction summary" },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          timestamp: "2026-08-24T10:00:00.000Z",
          message: { role: "user", content: [{ type: "text", text: "Fix authentication" }] },
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-session",
          message: { role: "user", content: [{ type: "tool_result", text: "hidden" }] },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-session",
          message: {
            role: "assistant",
            model: "claude-sonnet-5",
            content: [{ type: "text", text: "Updated the login flow" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-session",
          message: {
            role: "assistant",
            model: "<synthetic>",
            content: [{ type: "text", text: "The provider request failed" }],
          },
        }),
      ].join("\n"),
      source: "claudeAgent",
      providerInstanceId: ProviderInstanceId.make("claudeAgent"),
      fallbackSessionId: "fallback",
      lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
    });

    expect(thread).toMatchObject({
      providerSessionId: "claude-session",
      title: "Fix authentication",
      model: "claude-sonnet-5",
      messages: [
        { role: "user", text: "Fix authentication" },
        { role: "assistant", text: "Updated the login flow" },
        { role: "assistant", text: "The provider request failed" },
      ],
    });
  });

  it("skips sessions without a visible user message", () => {
    const thread = AgentSessionScanner.parseAgentSessionTranscript({
      contents: [
        encodeTranscriptRecord({ type: "session_meta", payload: { id: "codex-session" } }),
        encodeTranscriptRecord({
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Done" }],
          },
        }),
      ].join("\n"),
      source: "codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      fallbackSessionId: "codex-session",
      lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
    });

    expect(thread).toBeNull();
  });

  it("keeps the first prompt when later assistant output exceeds the message limit", () => {
    const transcript = [
      encodeTranscriptRecord({ type: "session_meta", payload: { id: "codex-session" } }),
      encodeTranscriptRecord({
        type: "event_msg",
        payload: { type: "user_message", message: "Keep this prompt" },
      }),
      ...Array.from({ length: 250 }, (_, index) =>
        encodeTranscriptRecord({
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: `Assistant update ${index}` }],
          },
        }),
      ),
    ].join("\n");

    const thread = AgentSessionScanner.parseAgentSessionTranscript({
      contents: transcript,
      source: "codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      fallbackSessionId: "fallback",
      lastActiveAtMs: Date.parse("2026-08-24T12:00:00.000Z"),
    });

    expect(thread?.messages).toHaveLength(200);
    expect(thread?.messages[0]?.text).toBe("Keep this prompt");
    expect(thread?.messages.at(-1)?.text).toBe("Assistant update 249");
  });
});
