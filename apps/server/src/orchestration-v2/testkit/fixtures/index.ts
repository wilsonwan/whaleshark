import { ProviderDriverKind } from "@t3tools/contracts";

import { assertAcpMessageSteeringOutput } from "./message_steering/acp_output.ts";
import { messageSteeringInput } from "./message_steering/input.ts";
import { assertMultiTurnOutput } from "./multi_turn/output.ts";
import { multiTurnInput } from "./multi_turn/input.ts";
import { openCodeChildApprovalInput } from "./opencode_child_approval/input.ts";
import { assertOpenCodeChildApprovalOutput } from "./opencode_child_approval/output.ts";
import { openCodeSubagentInput } from "./opencode_subagent/input.ts";
import { assertOpenCodeSubagentOutput } from "./opencode_subagent/output.ts";
import { assertPlanQuestionsOutput } from "./plan_questions/output.ts";
import { assertOpenCodePlanQuestionsOutput } from "./plan_questions/opencode_output.ts";
import { planQuestionsInput } from "./plan_questions/input.ts";
import { assertQueuedTurnOutput } from "./queued_turn/output.ts";
import { queuedTurnInput } from "./queued_turn/input.ts";
import { assertSimpleOutput } from "./simple/output.ts";
import { simpleInput } from "./simple/input.ts";
import { assertTodoListAcpOutput } from "./todo_list/acp_output.ts";
import { todoListInput } from "./todo_list/input.ts";
import { assertToolCallReadOnlyAcpOutput } from "./tool_call_read_only/acp_output.ts";
import { toolCallReadOnlyInput } from "./tool_call_read_only/input.ts";
import { assertToolCallReadOnlyOnRequestOutput } from "./tool_call_read_only_on_request/output.ts";
import { toolCallReadOnlyOnRequestInput } from "./tool_call_read_only_on_request/input.ts";
import { assertTurnInterruptOutput } from "./turn_interrupt/output.ts";
import { turnInterruptInput } from "./turn_interrupt/input.ts";
import {
  ACP_REGISTRY_MODEL_SELECTION,
  OPENCODE_MODEL_SELECTION,
  READ_ONLY_NEVER_POLICY,
  READ_ONLY_ON_REQUEST_POLICY,
  type OrchestratorReplayFixture,
  WORKSPACE_NEVER_POLICY,
} from "./shared.ts";

export const ORCHESTRATOR_REPLAY_FIXTURES: ReadonlyArray<OrchestratorReplayFixture> = [
  {
    name: "acp_elicitation",
    buildInput: planQuestionsInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./acp_elicitation/registry_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        runtimePolicyOverride: READ_ONLY_NEVER_POLICY,
        assertOutput: assertPlanQuestionsOutput,
      },
    ],
  },
  {
    name: "simple",
    buildInput: simpleInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./simple/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        assertOutput: assertSimpleOutput,
      },
      {
        driver: ProviderDriverKind.make("opencode"),
        transcriptFile: new URL("./simple/opencode_transcript.ndjson", import.meta.url),
        modelSelection: OPENCODE_MODEL_SELECTION,
        assertOutput: assertSimpleOutput,
      },
    ],
  },
  {
    name: "tool_call_read_only",
    buildInput: toolCallReadOnlyInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./tool_call_read_only/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        runtimePolicyOverride: READ_ONLY_NEVER_POLICY,
        assertOutput: assertToolCallReadOnlyAcpOutput,
      },
    ],
  },
  {
    name: "tool_call_read_only_on_request",
    buildInput: toolCallReadOnlyOnRequestInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL(
          "./tool_call_read_only_on_request/acp_transcript.ndjson",
          import.meta.url,
        ),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        runtimePolicyOverride: READ_ONLY_ON_REQUEST_POLICY,
        assertOutput: assertToolCallReadOnlyOnRequestOutput,
      },
    ],
  },
  {
    name: "opencode_subagent",
    buildInput: openCodeSubagentInput,
    providers: [
      {
        driver: ProviderDriverKind.make("opencode"),
        transcriptFile: new URL("./opencode_subagent/opencode_transcript.ndjson", import.meta.url),
        modelSelection: OPENCODE_MODEL_SELECTION,
        assertOutput: assertOpenCodeSubagentOutput,
      },
    ],
  },
  {
    name: "opencode_child_approval",
    buildInput: openCodeChildApprovalInput,
    providers: [
      {
        driver: ProviderDriverKind.make("opencode"),
        transcriptFile: new URL(
          "./opencode_child_approval/opencode_transcript.ndjson",
          import.meta.url,
        ),
        modelSelection: OPENCODE_MODEL_SELECTION,
        assertOutput: assertOpenCodeChildApprovalOutput,
      },
    ],
  },
  {
    name: "multi_turn",
    buildInput: multiTurnInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./multi_turn/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        assertOutput: assertMultiTurnOutput,
      },
    ],
  },
  {
    name: "queued_turn",
    buildInput: queuedTurnInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./queued_turn/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        assertOutput: assertQueuedTurnOutput,
      },
    ],
  },
  {
    name: "todo_list",
    buildInput: todoListInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./todo_list/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        runtimePolicyOverride: READ_ONLY_NEVER_POLICY,
        assertOutput: assertTodoListAcpOutput,
      },
    ],
  },
  {
    name: "plan_questions",
    buildInput: planQuestionsInput,
    providers: [
      {
        driver: ProviderDriverKind.make("opencode"),
        transcriptFile: new URL("./plan_questions/opencode_transcript.ndjson", import.meta.url),
        modelSelection: OPENCODE_MODEL_SELECTION,
        runtimePolicyOverride: READ_ONLY_NEVER_POLICY,
        assertOutput: assertOpenCodePlanQuestionsOutput,
      },
    ],
  },
  {
    name: "message_steering",
    buildInput: messageSteeringInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./message_steering/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        assertOutput: assertAcpMessageSteeringOutput,
      },
    ],
  },
  {
    name: "turn_interrupt",
    buildInput: turnInterruptInput,
    providers: [
      {
        driver: ProviderDriverKind.make("acpRegistry"),
        transcriptFile: new URL("./turn_interrupt/acp_transcript.ndjson", import.meta.url),
        modelSelection: ACP_REGISTRY_MODEL_SELECTION,
        runtimePolicyOverride: WORKSPACE_NEVER_POLICY,
        assertOutput: assertTurnInterruptOutput,
      },
      {
        driver: ProviderDriverKind.make("opencode"),
        transcriptFile: new URL("./turn_interrupt/opencode_transcript.ndjson", import.meta.url),
        modelSelection: OPENCODE_MODEL_SELECTION,
        runtimePolicyOverride: WORKSPACE_NEVER_POLICY,
        assertOutput: assertTurnInterruptOutput,
      },
    ],
  },
];
