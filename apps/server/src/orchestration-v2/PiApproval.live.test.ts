// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off globalDateInEffect:off globalFetch:off globalConsole:off preferSchemaOverJson:off - Live Pi approval verifier retains raw process evidence.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";
import { describe } from "vite-plus/test";

import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as HostPowerMonitor from "../background/HostPowerMonitor.ts";
import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import { ServerConfig } from "../config.ts";
import { layer as mcpSessionRegistryTestLayer } from "../mcp/McpSessionRegistry.testkit.ts";
import { makeSqlitePersistenceLive } from "../persistence/Layers/Sqlite.ts";
import * as ModelManifest from "../provider/ModelManifest.ts";
import { ProviderInstanceRegistryHydrationLive } from "../provider/Layers/ProviderInstanceRegistryHydration.ts";
import {
  NoOpProviderEventLoggers,
  ProviderEventLoggers,
} from "../provider/Layers/ProviderEventLoggers.ts";
import { OpenCodeRuntimeLive } from "../provider/opencodeRuntime.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { OrchestratorV2 } from "./Orchestrator.ts";
import { OrchestrationEffectWorkerV2 } from "./EffectWorker.ts";
import { worktreeRepairDependenciesTestLayer } from "./ProviderTurnStartService.testkit.ts";
import { OrchestrationV2LayerLive } from "./runtimeLayer.ts";

// Real Pi turn with a supervised approval gate. Opt in explicitly:
//   T3_PI_APPROVAL_LIVE=1 ../../node_modules/.bin/vp test run \
//     src/orchestration-v2/PiApproval.live.test.ts
const runLive = process.env.T3_PI_APPROVAL_LIVE === "1";
const liveInstanceId = ProviderInstanceId.make("pi");
const liveModelSelection = {
  instanceId: liveInstanceId,
  model: process.env.T3_PI_LIVE_MODEL?.trim() || "default",
};

const serverConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "t3-pi-approval-v2-live-",
});

const vcsDriverRegistryLayer = VcsDriverRegistry.layer.pipe(
  Layer.provide(VcsProcess.layer),
  Layer.provide(serverConfigLayer),
  Layer.provide(NodeServices.layer),
);

const checkpointStoreLayer = CheckpointStore.layer.pipe(Layer.provide(vcsDriverRegistryLayer));

const serverSettingsLayer = ServerSettingsService.layerTest({
  providerInstances: {
    [liveInstanceId]: {
      driver: ProviderDriverKind.make("pi"),
      displayName: "Pi live",
      enabled: true,
      config: { binaryPath: "pi" },
    },
  },
});

const backgroundPolicyLayer = BackgroundPolicy.layer.pipe(
  Layer.provide(Layer.effect(HostPowerMonitor.HostPowerMonitor, HostPowerMonitor.make())),
  Layer.provide(serverSettingsLayer),
);

const providerInstanceRegistryLayer = ProviderInstanceRegistryHydrationLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      serverConfigLayer.pipe(Layer.provide(NodeServices.layer)),
      serverSettingsLayer,
      NodeServices.layer,
      FetchHttpClient.layer,
      OpenCodeRuntimeLive.pipe(Layer.provide(NodeServices.layer)),
      Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers),
      ModelManifest.layerTest,
    ),
  ),
);

const sqliteLayer = makeSqlitePersistenceLive(
  NodePath.join(NodeOS.tmpdir(), `t3-pi-approval-live-${process.pid}.sqlite`),
).pipe(Layer.provide(NodeServices.layer));

const liveLayer = OrchestrationV2LayerLive.pipe(
  Layer.provide(mcpSessionRegistryTestLayer),
  Layer.provide(sqliteLayer),
  Layer.provide(checkpointStoreLayer),
  Layer.provide(serverConfigLayer),
  Layer.provide(serverSettingsLayer),
  Layer.provide(providerInstanceRegistryLayer),

  Layer.provide(backgroundPolicyLayer),
  Layer.provide(worktreeRepairDependenciesTestLayer),
  Layer.provide(NodeServices.layer),
);

const TERMINAL_RUN_STATUSES = ["completed", "failed", "cancelled", "interrupted", "rolled_back"];

const readProjection = Effect.fn("PiApprovalLive.readProjection")(function* (threadId: ThreadId) {
  const orchestrator = yield* OrchestratorV2;
  return yield* orchestrator.getThreadProjection(threadId);
});

describe.runIf(runLive)("Pi supervised approval (live)", () => {
  it.live(
    "runs a real Pi turn whose shell command is gated behind an approval",
    () =>
      Effect.gen(function* () {
        const orchestrator = yield* OrchestratorV2;
        // The live layer does not start the outbox daemon the production server
        // entry point forks, so this harness drives the effect worker itself.
        const worker = yield* OrchestrationEffectWorkerV2;
        const projectId = ProjectId.make("project:pi-approval-live");
        const threadId = ThreadId.make("thread:pi-approval-live");
        const marker = `PI_APPROVAL_LIVE_${Date.now()}`;
        const artifact = NodePath.join(NodeOS.tmpdir(), `${marker}.txt`);
        const workspace = NodeFS.mkdtempSync(
          NodePath.join(NodeOS.tmpdir(), "pi-approval-workspace-"),
        );
        yield* Effect.sync(() => {
          NodeChildProcess.execFileSync("git", ["init", "-q", workspace]);
        });
        const databasePath = NodePath.join(
          NodeOS.tmpdir(),
          `t3-pi-approval-live-${process.pid}.sqlite`,
        );
        const now = new Date().toISOString();
        yield* Effect.sync(() => {
          const database = new NodeSqlite.DatabaseSync(databasePath);
          try {
            database
              .prepare(
                `INSERT INTO projection_projects (
                   project_id, title, workspace_root, default_model_selection_json,
                   default_thread_env_mode, auto_pull, favicon_path, project_icon_json,
                   scripts_json, created_at, updated_at, deleted_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .run(
                projectId,
                "Pi approval live",
                workspace,
                null,
                null,
                0,
                null,
                null,
                "[]",
                now,
                now,
                null,
              );
          } finally {
            database.close();
          }
        });

        yield* orchestrator.dispatch({
          type: "thread.create",
          createdBy: "user",
          creationSource: "web",
          commandId: CommandId.make("command:pi-approval-live:create"),
          threadId,
          projectId,
          title: "Pi approval live",
          modelSelection: liveModelSelection,
          runtimeMode: "approval-required",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
        });
        yield* orchestrator.dispatch({
          type: "message.dispatch",
          createdBy: "user",
          creationSource: "web",
          commandId: CommandId.make("command:pi-approval-live:first"),
          threadId,
          messageId: MessageId.make("message:pi-approval-live:first"),
          text: `Run exactly this shell command with your terminal tool and nothing else: printf '${marker}' > ${artifact} . Then respond with exactly DONE.`,
          attachments: [],
          modelSelection: liveModelSelection,
          dispatchMode: { type: "start_immediately" },
        });

        let approvalSeen = false;
        let artifactAbsentBeforeApproval = false;
        let approvalPrompt = "";
        let projection: OrchestrationV2ThreadProjection | undefined;
        for (let attempt = 0; attempt < 240; attempt += 1) {
          // Drive the outbox: the run stays at `starting` until its
          // `provider-turn.start` effect is claimed and executed.
          yield* worker.drain(16).pipe(Effect.orElseSucceed(() => 0));
          projection = yield* readProjection(threadId);
          const pending = projection.runtimeRequests.find(
            (request) => request.status === "pending",
          );
          if (pending && !approvalSeen) {
            const turnItem = projection.turnItems.find(
              (entry) => entry.type === "approval_request" && entry.requestId === pending.id,
            );
            approvalPrompt =
              turnItem?.type === "approval_request"
                ? (turnItem.prompt ?? turnItem.title ?? "")
                : "";
            artifactAbsentBeforeApproval = !NodeFS.existsSync(artifact);
            approvalSeen = true;
            yield* Console.log(
              `Pi approval request kind=${pending.kind} prompt=${JSON.stringify(approvalPrompt)} artifactAbsent=${artifactAbsentBeforeApproval}`,
            );
            yield* orchestrator.dispatch({
              type: "runtime-request.respond",
              commandId: CommandId.make("command:pi-approval-live:approve"),
              threadId,
              requestId: pending.id,
              decision: "accept",
            });
          }
          const idle =
            projection.runs.length >= 1 &&
            projection.runs.every((run) => TERMINAL_RUN_STATUSES.includes(run.status));
          if (attempt % 10 === 0) {
            yield* Console.log(
              `tick=${attempt} runs=${JSON.stringify(projection.runs.map((run) => [run.providerInstanceId, run.status]))} sessions=${projection.providerSessions.length} threads=${projection.providerThreads.length} turns=${JSON.stringify(projection.providerTurns.map((turn) => turn.status))} requests=${projection.runtimeRequests.length} items=${projection.turnItems.length} messages=${projection.messages.length}`,
            );
          }
          if (approvalSeen && idle) break;
          yield* Effect.sleep("500 millis");
        }

        assert.isDefined(projection);
        // The approval response and the run's terminal events reach the
        // projection through the outbox; drain once more before asserting.
        yield* worker.drain(16).pipe(Effect.orElseSucceed(() => 0));
        const final = yield* readProjection(threadId);
        assert.isTrue(approvalSeen, "Pi never asked for approval");
        assert.isTrue(
          artifactAbsentBeforeApproval,
          "the gated command ran before the approval was given",
        );
        assert.isTrue(NodeFS.existsSync(artifact), "the approved command did not run");
        assert.strictEqual(NodeFS.readFileSync(artifact, "utf8"), marker);
        assert.deepEqual(
          final.runs.map((run) => run.status),
          ["completed"],
        );
        assert.isTrue(
          final.runtimeRequests.some((request) => request.status === "resolved"),
          "the runtime request was never resolved",
        );
        // The adapter re-emits the answer as `resolved` from its own pending
        // state, and that payload carries no decision, so the projection row
        // proves the request was answered while the artifact and the completed
        // command execution above prove it was answered with `accept`.
        assert.isFalse(
          final.runtimeRequests.some((request) => request.status === "pending"),
          "a runtime request is still pending after the turn finished",
        );
        assert.isTrue(
          final.turnItems.some(
            (entry) => entry.type === "command_execution" && entry.status === "completed",
          ),
          "no completed command execution was projected",
        );
        NodeFS.rmSync(artifact, { force: true });
        yield* Console.log(
          `Pi approval live passed. approvals=${JSON.stringify(final.runtimeRequests.map((request) => [request.kind, request.status, request.decision]))} runs=${JSON.stringify(final.runs.map((run) => run.status))}`,
        );
      }).pipe(Effect.provide(liveLayer), Effect.scoped),
    600_000,
  );
});
