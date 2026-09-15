import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { migrationEntries, runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const expectedObjects = [
  {
    type: "table",
    name: "auth_pairing_links",
    sql: "CREATE TABLE auth_pairing_links (\n      id TEXT PRIMARY KEY,\n      credential TEXT NOT NULL UNIQUE,\n      method TEXT NOT NULL,\n      scopes TEXT NOT NULL,\n      subject TEXT NOT NULL,\n      label TEXT,\n      created_at TEXT NOT NULL,\n      expires_at TEXT NOT NULL,\n      consumed_at TEXT,\n      revoked_at TEXT\n    , proof_key_thumbprint TEXT)",
  },
  {
    type: "table",
    name: "auth_sessions",
    sql: "CREATE TABLE auth_sessions (\n      session_id TEXT PRIMARY KEY,\n      subject TEXT NOT NULL,\n      scopes TEXT NOT NULL,\n      method TEXT NOT NULL,\n      client_label TEXT,\n      client_ip_address TEXT,\n      client_user_agent TEXT,\n      client_device_type TEXT NOT NULL DEFAULT 'unknown',\n      client_os TEXT,\n      client_browser TEXT,\n      issued_at TEXT NOT NULL,\n      expires_at TEXT NOT NULL,\n      last_connected_at TEXT,\n      revoked_at TEXT\n    , client_surface TEXT, client_app_version TEXT)",
  },
  {
    type: "table",
    name: "checkpoint_diff_blobs",
    sql: "CREATE TABLE checkpoint_diff_blobs (\n      thread_id TEXT NOT NULL,\n      from_turn_count INTEGER NOT NULL,\n      to_turn_count INTEGER NOT NULL,\n      diff TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      UNIQUE (thread_id, from_turn_count, to_turn_count)\n    )",
  },
  {
    type: "table",
    name: "effect_sql_migrations",
    sql: 'CREATE TABLE "effect_sql_migrations" (\n  migration_id integer PRIMARY KEY NOT NULL,\n  created_at datetime NOT NULL DEFAULT current_timestamp,\n  name VARCHAR(255) NOT NULL\n)',
  },
  {
    type: "table",
    name: "orchestration_command_receipts",
    sql: "CREATE TABLE orchestration_command_receipts (\n      command_id TEXT PRIMARY KEY,\n      aggregate_kind TEXT NOT NULL,\n      aggregate_id TEXT NOT NULL,\n      accepted_at TEXT NOT NULL,\n      result_sequence INTEGER NOT NULL,\n      status TEXT NOT NULL,\n      error TEXT\n    , command_type TEXT NOT NULL DEFAULT 'legacy')",
  },
  {
    type: "table",
    name: "orchestration_events",
    sql: "CREATE TABLE orchestration_events (\n      sequence INTEGER PRIMARY KEY AUTOINCREMENT,\n      event_id TEXT NOT NULL UNIQUE,\n      aggregate_kind TEXT NOT NULL,\n      stream_id TEXT NOT NULL,\n      stream_version INTEGER NOT NULL,\n      event_type TEXT NOT NULL,\n      occurred_at TEXT NOT NULL,\n      command_id TEXT,\n      causation_event_id TEXT,\n      correlation_id TEXT,\n      actor_kind TEXT NOT NULL,\n      payload_json TEXT NOT NULL,\n      metadata_json TEXT NOT NULL\n    , application_event_version INTEGER NOT NULL DEFAULT 1)",
  },
  {
    type: "table",
    name: "orchestration_v2_command_receipts",
    sql: "CREATE TABLE orchestration_v2_command_receipts (\n      command_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      command_type TEXT NOT NULL,\n      accepted_at TEXT NOT NULL,\n      result_sequence INTEGER NOT NULL,\n      status TEXT NOT NULL,\n      error TEXT\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_effect_outbox",
    sql: "CREATE TABLE \"orchestration_v2_effect_outbox\" (\n      effect_id TEXT PRIMARY KEY,\n      command_id TEXT NOT NULL,\n      thread_id TEXT NOT NULL,\n      effect_type TEXT NOT NULL,\n      payload_json TEXT NOT NULL,\n      status TEXT NOT NULL CHECK (\n        status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')\n      ),\n      attempt_count INTEGER NOT NULL DEFAULT 0,\n      available_at TEXT NOT NULL,\n      lease_owner TEXT,\n      lease_expires_at TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      completed_at TEXT,\n      last_error TEXT\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_events",
    sql: "CREATE TABLE orchestration_v2_events (\n      sequence INTEGER PRIMARY KEY AUTOINCREMENT,\n      event_id TEXT NOT NULL UNIQUE,\n      command_id TEXT,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      node_id TEXT,\n      provider TEXT,\n      raw_event_id TEXT,\n      event_type TEXT NOT NULL,\n      occurred_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    , driver TEXT, provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_checkpoint_scopes",
    sql: "CREATE TABLE orchestration_v2_projection_checkpoint_scopes (\n      scope_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      node_id TEXT NOT NULL,\n      parent_scope_id TEXT,\n      provider_thread_id TEXT,\n      kind TEXT NOT NULL,\n      ordinal_within_parent INTEGER NOT NULL,\n      advances_app_run_count INTEGER NOT NULL,\n      created_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_checkpoints",
    sql: "CREATE TABLE orchestration_v2_projection_checkpoints (\n      checkpoint_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      scope_id TEXT NOT NULL,\n      run_id TEXT,\n      node_id TEXT NOT NULL,\n      parent_checkpoint_id TEXT,\n      ordinal_within_scope INTEGER NOT NULL,\n      app_run_ordinal INTEGER,\n      status TEXT NOT NULL,\n      captured_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_context_handoffs",
    sql: "CREATE TABLE orchestration_v2_projection_context_handoffs (\n      context_handoff_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      target_run_id TEXT NOT NULL,\n      to_provider_thread_id TEXT NOT NULL,\n      strategy TEXT NOT NULL,\n      status TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_context_transfers",
    sql: "CREATE TABLE orchestration_v2_projection_context_transfers (\n      context_transfer_id TEXT PRIMARY KEY,\n      source_thread_id TEXT NOT NULL,\n      target_thread_id TEXT NOT NULL,\n      target_run_id TEXT,\n      type TEXT NOT NULL,\n      status TEXT NOT NULL,\n      source_provider TEXT,\n      target_provider TEXT,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    , source_provider_instance_id TEXT, target_provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_messages",
    sql: "CREATE TABLE orchestration_v2_projection_messages (\n      message_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      node_id TEXT,\n      role TEXT NOT NULL,\n      streaming INTEGER NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_metadata",
    sql: "CREATE TABLE orchestration_v2_projection_metadata (\n      projection_name TEXT PRIMARY KEY,\n      schema_version INTEGER NOT NULL,\n      last_sequence INTEGER NOT NULL,\n      updated_at TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_nodes",
    sql: "CREATE TABLE orchestration_v2_projection_nodes (\n      node_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      parent_node_id TEXT,\n      root_node_id TEXT NOT NULL,\n      kind TEXT NOT NULL,\n      status TEXT NOT NULL,\n      provider_thread_id TEXT,\n      provider_turn_id TEXT,\n      runtime_request_id TEXT,\n      checkpoint_scope_id TEXT,\n      started_at TEXT,\n      completed_at TEXT,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_plans",
    sql: "CREATE TABLE orchestration_v2_projection_plans (\n      plan_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      node_id TEXT NOT NULL,\n      kind TEXT NOT NULL,\n      status TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_provider_session_bindings",
    sql: "CREATE TABLE orchestration_v2_projection_provider_session_bindings (\n      provider_session_id TEXT NOT NULL,\n      thread_id TEXT NOT NULL,\n      PRIMARY KEY (provider_session_id, thread_id)\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_provider_sessions",
    sql: "CREATE TABLE orchestration_v2_projection_provider_sessions (\n      provider_session_id TEXT PRIMARY KEY,\n      thread_id TEXT,\n      provider TEXT NOT NULL,\n      status TEXT NOT NULL,\n      model TEXT,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    , driver TEXT, provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_provider_threads",
    sql: "CREATE TABLE orchestration_v2_projection_provider_threads (\n      provider_thread_id TEXT PRIMARY KEY,\n      thread_id TEXT,\n      owner_node_id TEXT,\n      provider TEXT NOT NULL,\n      provider_session_id TEXT,\n      status TEXT NOT NULL,\n      first_run_ordinal INTEGER,\n      last_run_ordinal INTEGER,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    , driver TEXT, provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_provider_turns",
    sql: "CREATE TABLE orchestration_v2_projection_provider_turns (\n      provider_turn_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      provider_thread_id TEXT NOT NULL,\n      node_id TEXT NOT NULL,\n      run_attempt_id TEXT,\n      ordinal INTEGER NOT NULL,\n      status TEXT NOT NULL,\n      started_at TEXT,\n      completed_at TEXT,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_run_attempts",
    sql: "CREATE TABLE orchestration_v2_projection_run_attempts (\n      attempt_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT NOT NULL,\n      attempt_ordinal INTEGER NOT NULL,\n      root_node_id TEXT NOT NULL,\n      provider TEXT NOT NULL,\n      provider_thread_id TEXT NOT NULL,\n      provider_turn_id TEXT,\n      status TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    , provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_runs",
    sql: "CREATE TABLE orchestration_v2_projection_runs (\n      run_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      ordinal INTEGER NOT NULL,\n      provider TEXT NOT NULL,\n      provider_thread_id TEXT,\n      status TEXT NOT NULL,\n      requested_at TEXT NOT NULL,\n      completed_at TEXT,\n      payload_json TEXT NOT NULL\n    , provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_runtime_requests",
    sql: "CREATE TABLE orchestration_v2_projection_runtime_requests (\n      runtime_request_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      node_id TEXT NOT NULL,\n      provider_turn_id TEXT,\n      kind TEXT NOT NULL,\n      status TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      resolved_at TEXT,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_subagents",
    sql: "CREATE TABLE orchestration_v2_projection_subagents (\n      subagent_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      parent_node_id TEXT NOT NULL,\n      provider TEXT NOT NULL,\n      provider_thread_id TEXT,\n      child_thread_id TEXT,\n      origin TEXT NOT NULL,\n      status TEXT NOT NULL,\n      started_at TEXT,\n      completed_at TEXT,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    , driver TEXT, provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_threads",
    sql: "CREATE TABLE orchestration_v2_projection_threads (\n      thread_id TEXT PRIMARY KEY,\n      project_id TEXT NOT NULL,\n      title TEXT NOT NULL,\n      default_provider TEXT NOT NULL,\n      runtime_mode TEXT NOT NULL,\n      interaction_mode TEXT NOT NULL,\n      active_provider_thread_id TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      archived_at TEXT,\n      deleted_at TEXT,\n      payload_json TEXT NOT NULL\n    , provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "orchestration_v2_projection_turn_items",
    sql: "CREATE TABLE orchestration_v2_projection_turn_items (\n      turn_item_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      run_id TEXT,\n      node_id TEXT,\n      provider_thread_id TEXT,\n      provider_turn_id TEXT,\n      parent_item_id TEXT,\n      ordinal INTEGER NOT NULL,\n      type TEXT NOT NULL,\n      status TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      payload_json TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_thread_launch_workflows",
    sql: "CREATE TABLE orchestration_v2_thread_launch_workflows (\n      command_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      project_id TEXT NOT NULL,\n      status TEXT NOT NULL,\n      title TEXT NOT NULL,\n      worktree_path TEXT,\n      branch TEXT,\n      setup_committed INTEGER NOT NULL DEFAULT 0,\n      thread_committed INTEGER NOT NULL DEFAULT 0,\n      message_committed INTEGER NOT NULL DEFAULT 0,\n      last_error TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "orchestration_v2_turn_item_positions",
    sql: "CREATE TABLE orchestration_v2_turn_item_positions (\n      thread_id TEXT NOT NULL,\n      turn_item_id TEXT NOT NULL,\n      ordinal INTEGER NOT NULL,\n      PRIMARY KEY (thread_id, turn_item_id),\n      UNIQUE (thread_id, ordinal)\n    )",
  },
  {
    type: "table",
    name: "projection_pending_approvals",
    sql: "CREATE TABLE projection_pending_approvals (\n      request_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      turn_id TEXT,\n      status TEXT NOT NULL,\n      decision TEXT,\n      created_at TEXT NOT NULL,\n      resolved_at TEXT\n    )",
  },
  {
    type: "table",
    name: "projection_projects",
    sql: "CREATE TABLE projection_projects (\n      project_id TEXT PRIMARY KEY,\n      title TEXT NOT NULL,\n      workspace_root TEXT NOT NULL,\n      scripts_json TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      deleted_at TEXT\n    , default_model_selection_json TEXT, default_thread_env_mode TEXT, favicon_path TEXT, auto_pull INTEGER NOT NULL DEFAULT 0, project_icon_json TEXT)",
  },
  {
    type: "table",
    name: "projection_state",
    sql: "CREATE TABLE projection_state (\n      projector TEXT PRIMARY KEY,\n      last_applied_sequence INTEGER NOT NULL,\n      updated_at TEXT NOT NULL\n    )",
  },
  {
    type: "table",
    name: "projection_thread_activities",
    sql: "CREATE TABLE projection_thread_activities (\n      activity_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      turn_id TEXT,\n      tone TEXT NOT NULL,\n      kind TEXT NOT NULL,\n      summary TEXT NOT NULL,\n      payload_json TEXT NOT NULL,\n      created_at TEXT NOT NULL\n    , sequence INTEGER)",
  },
  {
    type: "table",
    name: "projection_thread_messages",
    sql: "CREATE TABLE projection_thread_messages (\n      message_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      turn_id TEXT,\n      role TEXT NOT NULL,\n      text TEXT NOT NULL,\n      is_streaming INTEGER NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    , attachments_json TEXT, context_json TEXT)",
  },
  {
    type: "table",
    name: "projection_thread_proposed_plans",
    sql: "CREATE TABLE projection_thread_proposed_plans (\n      plan_id TEXT PRIMARY KEY,\n      thread_id TEXT NOT NULL,\n      turn_id TEXT,\n      plan_markdown TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    , implemented_at TEXT, implementation_thread_id TEXT)",
  },
  {
    type: "table",
    name: "projection_thread_pull_requests",
    sql: "CREATE TABLE projection_thread_pull_requests (\n      thread_id TEXT NOT NULL,\n      host TEXT NOT NULL,\n      repository TEXT NOT NULL,\n      number INTEGER NOT NULL,\n      url TEXT NOT NULL,\n      source TEXT NOT NULL,\n      linked_at TEXT NOT NULL,\n      snapshot_json TEXT,\n      stack_json TEXT,\n      PRIMARY KEY (thread_id, host, repository, number)\n    )",
  },
  {
    type: "table",
    name: "projection_thread_sessions",
    sql: "CREATE TABLE projection_thread_sessions (\n      thread_id TEXT PRIMARY KEY,\n      status TEXT NOT NULL,\n      provider_name TEXT,\n      provider_session_id TEXT,\n      provider_thread_id TEXT,\n      active_turn_id TEXT,\n      last_error TEXT,\n      updated_at TEXT NOT NULL\n    , runtime_mode TEXT NOT NULL DEFAULT 'full-access', provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "projection_threads",
    sql: "CREATE TABLE projection_threads (\n      thread_id TEXT PRIMARY KEY,\n      project_id TEXT NOT NULL,\n      title TEXT NOT NULL,\n      branch TEXT,\n      worktree_path TEXT,\n      latest_turn_id TEXT,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      deleted_at TEXT\n    , runtime_mode TEXT NOT NULL DEFAULT 'full-access', interaction_mode TEXT NOT NULL DEFAULT 'default', model_selection_json TEXT, archived_at TEXT, latest_user_message_at TEXT, pending_approval_count INTEGER NOT NULL DEFAULT 0, pending_user_input_count INTEGER NOT NULL DEFAULT 0, has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0, settled_override TEXT, settled_at TEXT, snoozed_until TEXT, snoozed_at TEXT, title_regeneration_request_id TEXT, title_regeneration_started_at TEXT, pinned_at TEXT, pin_order_key TEXT, linked_pull_request_json TEXT, unsettled_at TEXT, branch_pull_request_json TEXT, active_order_key TEXT)",
  },
  {
    type: "table",
    name: "projection_turns",
    sql: "CREATE TABLE projection_turns (\n      row_id INTEGER PRIMARY KEY AUTOINCREMENT,\n      thread_id TEXT NOT NULL,\n      turn_id TEXT,\n      pending_message_id TEXT,\n      assistant_message_id TEXT,\n      state TEXT NOT NULL,\n      requested_at TEXT NOT NULL,\n      started_at TEXT,\n      completed_at TEXT,\n      checkpoint_turn_count INTEGER,\n      checkpoint_ref TEXT,\n      checkpoint_status TEXT,\n      checkpoint_files_json TEXT NOT NULL, source_proposed_plan_thread_id TEXT, source_proposed_plan_id TEXT,\n      UNIQUE (thread_id, turn_id),\n      UNIQUE (thread_id, checkpoint_turn_count)\n    )",
  },
  {
    type: "table",
    name: "provider_session_runtime",
    sql: "CREATE TABLE provider_session_runtime (\n      thread_id TEXT PRIMARY KEY,\n      provider_name TEXT NOT NULL,\n      adapter_key TEXT NOT NULL,\n      runtime_mode TEXT NOT NULL DEFAULT 'full-access',\n      status TEXT NOT NULL,\n      last_seen_at TEXT NOT NULL,\n      resume_cursor_json TEXT,\n      runtime_payload_json TEXT\n    , provider_instance_id TEXT)",
  },
  {
    type: "table",
    name: "scheduled_tasks",
    sql: "CREATE TABLE scheduled_tasks (\n      task_id TEXT PRIMARY KEY,\n      title TEXT NOT NULL,\n      prompt TEXT NOT NULL,\n      enabled INTEGER NOT NULL,\n      schedule_json TEXT NOT NULL,\n      project_id TEXT NOT NULL,\n      thread_id TEXT,\n      workspace_strategy_json TEXT NOT NULL,\n      model_selection_json TEXT NOT NULL,\n      runtime_mode TEXT NOT NULL,\n      interaction_mode TEXT NOT NULL,\n      created_by TEXT NOT NULL,\n      creation_source TEXT NOT NULL,\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL,\n      next_run_at TEXT,\n      last_run_at TEXT,\n      last_run_status TEXT NOT NULL,\n      last_run_error TEXT,\n      run_count INTEGER NOT NULL\n    )",
  },
  {
    type: "index",
    name: "idx_auth_pairing_links_active",
    sql: "CREATE INDEX idx_auth_pairing_links_active\n    ON auth_pairing_links(revoked_at, consumed_at, expires_at)",
  },
  {
    type: "index",
    name: "idx_auth_sessions_active",
    sql: "CREATE INDEX idx_auth_sessions_active\n    ON auth_sessions(revoked_at, expires_at, issued_at)",
  },
  {
    type: "index",
    name: "idx_checkpoint_diff_blobs_thread_to_turn",
    sql: "CREATE INDEX idx_checkpoint_diff_blobs_thread_to_turn\n    ON checkpoint_diff_blobs(thread_id, to_turn_count)",
  },
  {
    type: "index",
    name: "idx_orch_command_receipts_aggregate",
    sql: "CREATE INDEX idx_orch_command_receipts_aggregate\n    ON orchestration_command_receipts(aggregate_kind, aggregate_id)",
  },
  {
    type: "index",
    name: "idx_orch_command_receipts_sequence",
    sql: "CREATE INDEX idx_orch_command_receipts_sequence\n    ON orchestration_command_receipts(result_sequence)",
  },
  {
    type: "index",
    name: "idx_orch_events_command_id",
    sql: "CREATE INDEX idx_orch_events_command_id\n    ON orchestration_events(command_id)",
  },
  {
    type: "index",
    name: "idx_orch_events_correlation_id",
    sql: "CREATE INDEX idx_orch_events_correlation_id\n    ON orchestration_events(correlation_id)",
  },
  {
    type: "index",
    name: "idx_orch_events_stream_sequence",
    sql: "CREATE INDEX idx_orch_events_stream_sequence\n    ON orchestration_events(aggregate_kind, stream_id, sequence)",
  },
  {
    type: "index",
    name: "idx_orch_events_stream_version",
    sql: "CREATE UNIQUE INDEX idx_orch_events_stream_version\n    ON orchestration_events(aggregate_kind, stream_id, stream_version)",
  },
  {
    type: "index",
    name: "idx_orchestration_events_agent_stream_sequence",
    sql: "CREATE INDEX idx_orchestration_events_agent_stream_sequence\n    ON orchestration_events(stream_id, sequence)\n    WHERE application_event_version = 2 AND aggregate_kind = 'thread'",
  },
  {
    type: "index",
    name: "idx_orchestration_events_application_high_water",
    sql: "CREATE INDEX idx_orchestration_events_application_high_water\n    ON orchestration_events(sequence)\n    WHERE aggregate_kind = 'project'\n      OR (application_event_version = 2 AND aggregate_kind = 'thread')",
  },
  {
    type: "index",
    name: "idx_orchestration_events_application_sequence",
    sql: "CREATE INDEX idx_orchestration_events_application_sequence\n    ON orchestration_events(application_event_version, sequence)",
  },
  {
    type: "index",
    name: "idx_projection_pending_approvals_thread_status",
    sql: "CREATE INDEX idx_projection_pending_approvals_thread_status\n    ON projection_pending_approvals(thread_id, status)",
  },
  {
    type: "index",
    name: "idx_projection_projects_updated_at",
    sql: "CREATE INDEX idx_projection_projects_updated_at\n    ON projection_projects(updated_at)",
  },
  {
    type: "index",
    name: "idx_projection_projects_workspace_root_deleted_at",
    sql: "CREATE INDEX idx_projection_projects_workspace_root_deleted_at\n    ON projection_projects(workspace_root, deleted_at)",
  },
  {
    type: "index",
    name: "idx_projection_thread_activities_thread_created",
    sql: "CREATE INDEX idx_projection_thread_activities_thread_created\n    ON projection_thread_activities(thread_id, created_at)",
  },
  {
    type: "index",
    name: "idx_projection_thread_activities_thread_sequence",
    sql: "CREATE INDEX idx_projection_thread_activities_thread_sequence\n    ON projection_thread_activities(thread_id, sequence)",
  },
  {
    type: "index",
    name: "idx_projection_thread_activities_thread_sequence_created_id",
    sql: "CREATE INDEX idx_projection_thread_activities_thread_sequence_created_id\n    ON projection_thread_activities(thread_id, sequence, created_at, activity_id)",
  },
  {
    type: "index",
    name: "idx_projection_thread_messages_thread_created",
    sql: "CREATE INDEX idx_projection_thread_messages_thread_created\n    ON projection_thread_messages(thread_id, created_at)",
  },
  {
    type: "index",
    name: "idx_projection_thread_messages_thread_created_id",
    sql: "CREATE INDEX idx_projection_thread_messages_thread_created_id\n    ON projection_thread_messages(thread_id, created_at, message_id)",
  },
  {
    type: "index",
    name: "idx_projection_thread_proposed_plans_thread_created",
    sql: "CREATE INDEX idx_projection_thread_proposed_plans_thread_created\n    ON projection_thread_proposed_plans(thread_id, created_at)",
  },
  {
    type: "index",
    name: "idx_projection_thread_pull_requests_pr",
    sql: "CREATE INDEX idx_projection_thread_pull_requests_pr\n    ON projection_thread_pull_requests(host, repository, number)",
  },
  {
    type: "index",
    name: "idx_projection_thread_sessions_instance",
    sql: "CREATE INDEX idx_projection_thread_sessions_instance\n    ON projection_thread_sessions(provider_instance_id)",
  },
  {
    type: "index",
    name: "idx_projection_thread_sessions_provider_session",
    sql: "CREATE INDEX idx_projection_thread_sessions_provider_session\n    ON projection_thread_sessions(provider_session_id)",
  },
  {
    type: "index",
    name: "idx_projection_threads_project_archived_at",
    sql: "CREATE INDEX idx_projection_threads_project_archived_at\n    ON projection_threads(project_id, archived_at)",
  },
  {
    type: "index",
    name: "idx_projection_threads_project_deleted_created",
    sql: "CREATE INDEX idx_projection_threads_project_deleted_created\n    ON projection_threads(project_id, deleted_at, created_at)",
  },
  {
    type: "index",
    name: "idx_projection_threads_project_id",
    sql: "CREATE INDEX idx_projection_threads_project_id\n    ON projection_threads(project_id)",
  },
  {
    type: "index",
    name: "idx_projection_threads_shell_active",
    sql: "CREATE INDEX idx_projection_threads_shell_active\n    ON projection_threads(deleted_at, archived_at, project_id, created_at, thread_id)",
  },
  {
    type: "index",
    name: "idx_projection_threads_shell_archived",
    sql: "CREATE INDEX idx_projection_threads_shell_archived\n    ON projection_threads(deleted_at, archived_at, project_id, thread_id)",
  },
  {
    type: "index",
    name: "idx_projection_turns_thread_checkpoint_completed",
    sql: "CREATE INDEX idx_projection_turns_thread_checkpoint_completed\n    ON projection_turns(thread_id, checkpoint_turn_count, completed_at)",
  },
  {
    type: "index",
    name: "idx_projection_turns_thread_keyset",
    sql: "CREATE INDEX idx_projection_turns_thread_keyset\n    ON projection_turns(thread_id, requested_at, turn_id)",
  },
  {
    type: "index",
    name: "idx_projection_turns_thread_requested",
    sql: "CREATE INDEX idx_projection_turns_thread_requested\n    ON projection_turns(thread_id, requested_at)",
  },
  {
    type: "index",
    name: "idx_provider_session_runtime_instance",
    sql: "CREATE INDEX idx_provider_session_runtime_instance\n    ON provider_session_runtime(provider_instance_id)",
  },
  {
    type: "index",
    name: "idx_provider_session_runtime_provider",
    sql: "CREATE INDEX idx_provider_session_runtime_provider\n    ON provider_session_runtime(provider_name)",
  },
  {
    type: "index",
    name: "idx_provider_session_runtime_status",
    sql: "CREATE INDEX idx_provider_session_runtime_status\n    ON provider_session_runtime(status)",
  },
  {
    type: "index",
    name: "idx_scheduled_tasks_due",
    sql: "CREATE INDEX idx_scheduled_tasks_due\n    ON scheduled_tasks(enabled, next_run_at)\n    WHERE enabled = 1 AND next_run_at IS NOT NULL",
  },
  {
    type: "index",
    name: "idx_scheduled_tasks_project",
    sql: "CREATE INDEX idx_scheduled_tasks_project\n    ON scheduled_tasks(project_id, updated_at)",
  },
  {
    type: "index",
    name: "orchestration_events_v2_created_threads_idx",
    sql: "CREATE INDEX orchestration_events_v2_created_threads_idx\n    ON orchestration_events(stream_id)\n    WHERE application_event_version = 2\n      AND aggregate_kind = 'thread'\n      AND event_type = 'thread.created'",
  },
  {
    type: "index",
    name: "orchestration_v2_command_receipts_thread_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_command_receipts_thread_sequence_idx ON orchestration_v2_command_receipts(thread_id, result_sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_effect_outbox_claim_idx",
    sql: "CREATE INDEX orchestration_v2_effect_outbox_claim_idx\n    ON orchestration_v2_effect_outbox(status, available_at, lease_expires_at, created_at)",
  },
  {
    type: "index",
    name: "orchestration_v2_effect_outbox_command_idx",
    sql: "CREATE INDEX orchestration_v2_effect_outbox_command_idx\n    ON orchestration_v2_effect_outbox(command_id, effect_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_effect_outbox_thread_status_idx",
    sql: "CREATE INDEX orchestration_v2_effect_outbox_thread_status_idx\n    ON orchestration_v2_effect_outbox(thread_id, status, effect_type)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_command_idx",
    sql: "CREATE INDEX orchestration_v2_events_command_idx ON orchestration_v2_events(command_id, sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_instance_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_instance_sequence_idx ON orchestration_v2_events(provider_instance_id, sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_node_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_node_sequence_idx ON orchestration_v2_events(node_id, sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_raw_event_idx",
    sql: "CREATE INDEX orchestration_v2_events_raw_event_idx ON orchestration_v2_events(raw_event_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_run_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_run_sequence_idx ON orchestration_v2_events(run_id, sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_thread_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_thread_sequence_idx ON orchestration_v2_events(thread_id, sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_events_thread_type_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_thread_type_sequence_idx ON orchestration_v2_events(thread_id, event_type, sequence)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_checkpoint_scopes_parent_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoint_scopes_parent_idx ON orchestration_v2_projection_checkpoint_scopes(parent_scope_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_checkpoint_scopes_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoint_scopes_thread_idx ON orchestration_v2_projection_checkpoint_scopes(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_checkpoints_parent_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoints_parent_idx ON orchestration_v2_projection_checkpoints(parent_checkpoint_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_checkpoints_scope_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_checkpoints_scope_ordinal_idx ON orchestration_v2_projection_checkpoints(scope_id, ordinal_within_scope)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_checkpoints_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoints_thread_idx ON orchestration_v2_projection_checkpoints(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_context_handoffs_target_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_handoffs_target_run_idx ON orchestration_v2_projection_context_handoffs(target_run_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_context_handoffs_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_handoffs_thread_idx ON orchestration_v2_projection_context_handoffs(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_context_transfers_source_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_transfers_source_thread_idx ON orchestration_v2_projection_context_transfers(source_thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_context_transfers_target_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_transfers_target_run_idx ON orchestration_v2_projection_context_transfers(target_run_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_context_transfers_target_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_transfers_target_thread_idx ON orchestration_v2_projection_context_transfers(target_thread_id, status)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_messages_latest_user_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_latest_user_idx\n    ON orchestration_v2_projection_messages(thread_id, updated_at DESC, message_id DESC)\n    WHERE role = 'user'",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_messages_node_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_node_idx ON orchestration_v2_projection_messages(node_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_messages_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_run_idx ON orchestration_v2_projection_messages(run_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_messages_thread_created_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_thread_created_idx ON orchestration_v2_projection_messages(thread_id, created_at, message_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_nodes_parent_idx",
    sql: "CREATE INDEX orchestration_v2_projection_nodes_parent_idx ON orchestration_v2_projection_nodes(parent_node_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_nodes_provider_turn_idx",
    sql: "CREATE INDEX orchestration_v2_projection_nodes_provider_turn_idx ON orchestration_v2_projection_nodes(provider_turn_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_nodes_thread_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_nodes_thread_run_idx ON orchestration_v2_projection_nodes(thread_id, run_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_plans_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_plans_run_idx ON orchestration_v2_projection_plans(run_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_plans_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_plans_thread_idx ON orchestration_v2_projection_plans(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_session_bindings_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_session_bindings_thread_idx\n    ON orchestration_v2_projection_provider_session_bindings(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_sessions_instance_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_sessions_instance_status_idx ON orchestration_v2_projection_provider_sessions(provider_instance_id, status)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_sessions_provider_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_sessions_provider_status_idx ON orchestration_v2_projection_provider_sessions(provider, status)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_sessions_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_sessions_thread_idx ON orchestration_v2_projection_provider_sessions(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_threads_instance_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_instance_status_idx ON orchestration_v2_projection_provider_threads(provider_instance_id, status)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_threads_owner_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_owner_idx ON orchestration_v2_projection_provider_threads(owner_node_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_threads_session_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_session_idx ON orchestration_v2_projection_provider_threads(provider_session_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_threads_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_thread_idx ON orchestration_v2_projection_provider_threads(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_turns_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_turns_thread_idx ON orchestration_v2_projection_provider_turns(thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_provider_turns_thread_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_provider_turns_thread_ordinal_idx ON orchestration_v2_projection_provider_turns(provider_thread_id, ordinal)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_requests_recovery_idx",
    sql: "CREATE INDEX orchestration_v2_projection_requests_recovery_idx\n    ON orchestration_v2_projection_runtime_requests(thread_id)\n    WHERE status = 'pending'",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_run_attempts_run_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_run_attempts_run_ordinal_idx ON orchestration_v2_projection_run_attempts(run_id, attempt_ordinal)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_run_attempts_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_run_attempts_thread_idx ON orchestration_v2_projection_run_attempts(thread_id, run_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_runs_provider_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runs_provider_thread_idx ON orchestration_v2_projection_runs(provider_thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_runs_recovery_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runs_recovery_idx\n    ON orchestration_v2_projection_runs(status, thread_id)\n    WHERE status IN ('queued', 'preparing', 'starting', 'running', 'waiting')",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_runs_thread_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_runs_thread_ordinal_idx ON orchestration_v2_projection_runs(thread_id, ordinal)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_runs_thread_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runs_thread_status_idx ON orchestration_v2_projection_runs(thread_id, status)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_runtime_requests_provider_turn_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runtime_requests_provider_turn_idx ON orchestration_v2_projection_runtime_requests(provider_turn_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_runtime_requests_thread_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runtime_requests_thread_status_idx ON orchestration_v2_projection_runtime_requests(thread_id, status)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_subagents_child_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_child_thread_idx ON orchestration_v2_projection_subagents(child_thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_subagents_parent_node_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_parent_node_idx ON orchestration_v2_projection_subagents(parent_node_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_subagents_provider_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_provider_thread_idx ON orchestration_v2_projection_subagents(provider_thread_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_subagents_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_thread_idx ON orchestration_v2_projection_subagents(thread_id, started_at, subagent_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_threads_project_updated_idx",
    sql: "CREATE INDEX orchestration_v2_projection_threads_project_updated_idx ON orchestration_v2_projection_threads(project_id, updated_at)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_node_ordinal_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_node_ordinal_idx ON orchestration_v2_projection_turn_items(node_id, ordinal)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_provider_turn_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_provider_turn_idx ON orchestration_v2_projection_turn_items(provider_turn_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_recovery_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_recovery_idx\n    ON orchestration_v2_projection_turn_items(thread_id)\n    WHERE type IN ('command_execution', 'dynamic_tool', 'subagent')\n      AND status IN ('pending', 'running', 'waiting')",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_run_ordinal_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_run_ordinal_idx ON orchestration_v2_projection_turn_items(run_id, ordinal)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_shell_pending_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_shell_pending_idx\n    ON orchestration_v2_projection_turn_items(thread_id, run_id)\n    WHERE type IN ('command_execution', 'dynamic_tool', 'subagent')\n      AND status NOT IN ('completed', 'interrupted', 'failed', 'cancelled')",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_thread_ordinal_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_thread_ordinal_idx ON orchestration_v2_projection_turn_items(thread_id, ordinal, turn_item_id)",
  },
  {
    type: "index",
    name: "orchestration_v2_projection_turn_items_thread_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_thread_run_idx\n    ON orchestration_v2_projection_turn_items(thread_id, run_id)",
  },
] as const;
const expectedTables = [
  {
    name: "auth_pairing_links",
    columns: [
      { cid: 0, name: "id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "credential", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "method", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "scopes", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "subject", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "label", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "expires_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "consumed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "revoked_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "proof_key_thumbprint", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "auth_sessions",
    columns: [
      { cid: 0, name: "session_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "subject", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "scopes", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "method", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "client_label", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "client_ip_address", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "client_user_agent", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 7,
        name: "client_device_type",
        type: "TEXT",
        notnull: 1,
        dflt_value: "'unknown'",
        pk: 0,
      },
      { cid: 8, name: "client_os", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "client_browser", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "issued_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 11, name: "expires_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "last_connected_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 13, name: "revoked_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 14, name: "client_surface", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 15, name: "client_app_version", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "checkpoint_diff_blobs",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 1, name: "from_turn_count", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "to_turn_count", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "diff", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "effect_sql_migrations",
    columns: [
      { cid: 0, name: "migration_id", type: "INTEGER", notnull: 1, dflt_value: null, pk: 1 },
      {
        cid: 1,
        name: "created_at",
        type: "datetime",
        notnull: 1,
        dflt_value: "current_timestamp",
        pk: 0,
      },
      { cid: 2, name: "name", type: "VARCHAR(255)", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_command_receipts",
    columns: [
      { cid: 0, name: "command_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "aggregate_kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "aggregate_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "accepted_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "result_sequence", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "error", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "command_type", type: "TEXT", notnull: 1, dflt_value: "'legacy'", pk: 0 },
    ],
  },
  {
    name: "orchestration_events",
    columns: [
      { cid: 0, name: "sequence", type: "INTEGER", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "event_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "aggregate_kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "stream_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "stream_version", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "event_type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "occurred_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "command_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "causation_event_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "correlation_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "actor_kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 11, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "metadata_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 13,
        name: "application_event_version",
        type: "INTEGER",
        notnull: 1,
        dflt_value: "1",
        pk: 0,
      },
    ],
  },
  {
    name: "orchestration_v2_command_receipts",
    columns: [
      { cid: 0, name: "command_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "command_type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "accepted_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "result_sequence", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "error", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_effect_outbox",
    columns: [
      { cid: 0, name: "effect_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "command_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "effect_type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "attempt_count", type: "INTEGER", notnull: 1, dflt_value: "0", pk: 0 },
      { cid: 7, name: "available_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "lease_owner", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "lease_expires_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 11, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "completed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 13, name: "last_error", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_events",
    columns: [
      { cid: 0, name: "sequence", type: "INTEGER", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "event_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "command_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "node_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "provider", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "raw_event_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "event_type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "occurred_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 11, name: "driver", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 12, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_checkpoint_scopes",
    columns: [
      { cid: 0, name: "scope_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "parent_scope_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 7,
        name: "ordinal_within_parent",
        type: "INTEGER",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
      {
        cid: 8,
        name: "advances_app_run_count",
        type: "INTEGER",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
      { cid: 9, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_checkpoints",
    columns: [
      { cid: 0, name: "checkpoint_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "scope_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "parent_checkpoint_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 6,
        name: "ordinal_within_scope",
        type: "INTEGER",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
      { cid: 7, name: "app_run_ordinal", type: "INTEGER", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "captured_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_context_handoffs",
    columns: [
      { cid: 0, name: "context_handoff_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "target_run_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "to_provider_thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "strategy", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_context_transfers",
    columns: [
      { cid: 0, name: "context_transfer_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "source_thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "target_thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "target_run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "source_provider", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "target_provider", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 10,
        name: "source_provider_instance_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      {
        cid: 11,
        name: "target_provider_instance_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
    ],
  },
  {
    name: "orchestration_v2_projection_messages",
    columns: [
      { cid: 0, name: "message_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "node_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "role", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "streaming", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_metadata",
    columns: [
      { cid: 0, name: "projection_name", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "schema_version", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "last_sequence", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_nodes",
    columns: [
      { cid: 0, name: "node_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "parent_node_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "root_node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "provider_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "runtime_request_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "checkpoint_scope_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: "started_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 12, name: "completed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 13, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_plans",
    columns: [
      { cid: 0, name: "plan_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_session_bindings",
    columns: [
      { cid: 0, name: "provider_session_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 2 },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_sessions",
    columns: [
      { cid: 0, name: "provider_session_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 2, name: "provider", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "model", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "driver", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_threads",
    columns: [
      { cid: 0, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 2, name: "owner_node_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "provider", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "provider_session_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "first_run_ordinal", type: "INTEGER", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "last_run_ordinal", type: "INTEGER", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "driver", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_turns",
    columns: [
      { cid: 0, name: "provider_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "provider_thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "run_attempt_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "ordinal", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "started_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "completed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_run_attempts",
    columns: [
      { cid: 0, name: "attempt_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "attempt_ordinal", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "root_node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "provider", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "provider_thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "provider_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_runs",
    columns: [
      { cid: 0, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "ordinal", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "provider", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "requested_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "completed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_runtime_requests",
    columns: [
      { cid: 0, name: "runtime_request_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "provider_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "resolved_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_subagents",
    columns: [
      { cid: 0, name: "subagent_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "parent_node_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "provider", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "child_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "origin", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "started_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "completed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 13, name: "driver", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 14, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_threads",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "project_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "title", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "default_provider", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "runtime_mode", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "interaction_mode", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 6,
        name: "active_provider_thread_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      { cid: 7, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "archived_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "deleted_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_projection_turn_items",
    columns: [
      { cid: 0, name: "turn_item_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "run_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "node_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "provider_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "parent_item_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "ordinal", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "type", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 11, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_thread_launch_workflows",
    columns: [
      { cid: 0, name: "command_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "project_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "title", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "worktree_path", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "branch", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "setup_committed", type: "INTEGER", notnull: 1, dflt_value: "0", pk: 0 },
      { cid: 8, name: "thread_committed", type: "INTEGER", notnull: 1, dflt_value: "0", pk: 0 },
      { cid: 9, name: "message_committed", type: "INTEGER", notnull: 1, dflt_value: "0", pk: 0 },
      { cid: 10, name: "last_error", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "orchestration_v2_turn_item_positions",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
      { cid: 1, name: "turn_item_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 2 },
      { cid: 2, name: "ordinal", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_pending_approvals",
    columns: [
      { cid: 0, name: "request_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "decision", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "resolved_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_projects",
    columns: [
      { cid: 0, name: "project_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "title", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "workspace_root", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "scripts_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "deleted_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 7,
        name: "default_model_selection_json",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      {
        cid: 8,
        name: "default_thread_env_mode",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      { cid: 9, name: "favicon_path", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: "auto_pull", type: "INTEGER", notnull: 1, dflt_value: "0", pk: 0 },
      { cid: 11, name: "project_icon_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_state",
    columns: [
      { cid: 0, name: "projector", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      {
        cid: 1,
        name: "last_applied_sequence",
        type: "INTEGER",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
      { cid: 2, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_thread_activities",
    columns: [
      { cid: 0, name: "activity_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "tone", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "kind", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "summary", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "payload_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "sequence", type: "INTEGER", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_thread_messages",
    columns: [
      { cid: 0, name: "message_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "role", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "text", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "is_streaming", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "attachments_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: "context_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_thread_proposed_plans",
    columns: [
      { cid: 0, name: "plan_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "plan_markdown", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "implemented_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 7,
        name: "implementation_thread_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
    ],
  },
  {
    name: "projection_thread_pull_requests",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 1 },
      { cid: 1, name: "host", type: "TEXT", notnull: 1, dflt_value: null, pk: 2 },
      { cid: 2, name: "repository", type: "TEXT", notnull: 1, dflt_value: null, pk: 3 },
      { cid: 3, name: "number", type: "INTEGER", notnull: 1, dflt_value: null, pk: 4 },
      { cid: 4, name: "url", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "source", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "linked_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "snapshot_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "stack_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_thread_sessions",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "provider_name", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "provider_session_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "provider_thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "active_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "last_error", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 8,
        name: "runtime_mode",
        type: "TEXT",
        notnull: 1,
        dflt_value: "'full-access'",
        pk: 0,
      },
      { cid: 9, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_threads",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "project_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "title", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "branch", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "worktree_path", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "latest_turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 6, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 8, name: "deleted_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 9,
        name: "runtime_mode",
        type: "TEXT",
        notnull: 1,
        dflt_value: "'full-access'",
        pk: 0,
      },
      {
        cid: 10,
        name: "interaction_mode",
        type: "TEXT",
        notnull: 1,
        dflt_value: "'default'",
        pk: 0,
      },
      { cid: 11, name: "model_selection_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 12, name: "archived_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 13,
        name: "latest_user_message_at",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      {
        cid: 14,
        name: "pending_approval_count",
        type: "INTEGER",
        notnull: 1,
        dflt_value: "0",
        pk: 0,
      },
      {
        cid: 15,
        name: "pending_user_input_count",
        type: "INTEGER",
        notnull: 1,
        dflt_value: "0",
        pk: 0,
      },
      {
        cid: 16,
        name: "has_actionable_proposed_plan",
        type: "INTEGER",
        notnull: 1,
        dflt_value: "0",
        pk: 0,
      },
      { cid: 17, name: "settled_override", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 18, name: "settled_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 19, name: "snoozed_until", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 20, name: "snoozed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 21,
        name: "title_regeneration_request_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      {
        cid: 22,
        name: "title_regeneration_started_at",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      { cid: 23, name: "pinned_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 24, name: "pin_order_key", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 25,
        name: "linked_pull_request_json",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      { cid: 26, name: "unsettled_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 27,
        name: "branch_pull_request_json",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      { cid: 28, name: "active_order_key", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "projection_turns",
    columns: [
      { cid: 0, name: "row_id", type: "INTEGER", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "thread_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "turn_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: "pending_message_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: "assistant_message_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 5, name: "state", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "requested_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 7, name: "started_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "completed_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 9,
        name: "checkpoint_turn_count",
        type: "INTEGER",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      { cid: 10, name: "checkpoint_ref", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: "checkpoint_status", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 12, name: "checkpoint_files_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 13,
        name: "source_proposed_plan_thread_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
      {
        cid: 14,
        name: "source_proposed_plan_id",
        type: "TEXT",
        notnull: 0,
        dflt_value: null,
        pk: 0,
      },
    ],
  },
  {
    name: "provider_session_runtime",
    columns: [
      { cid: 0, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "provider_name", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "adapter_key", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      {
        cid: 3,
        name: "runtime_mode",
        type: "TEXT",
        notnull: 1,
        dflt_value: "'full-access'",
        pk: 0,
      },
      { cid: 4, name: "status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "last_seen_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "resume_cursor_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: "runtime_payload_json", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: "provider_instance_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
    ],
  },
  {
    name: "scheduled_tasks",
    columns: [
      { cid: 0, name: "task_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: "title", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: "prompt", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 3, name: "enabled", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 4, name: "schedule_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: "project_id", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: "thread_id", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      {
        cid: 7,
        name: "workspace_strategy_json",
        type: "TEXT",
        notnull: 1,
        dflt_value: null,
        pk: 0,
      },
      { cid: 8, name: "model_selection_json", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 9, name: "runtime_mode", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 10, name: "interaction_mode", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 11, name: "created_by", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 12, name: "creation_source", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 13, name: "created_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 14, name: "updated_at", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 15, name: "next_run_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 16, name: "last_run_at", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 17, name: "last_run_status", type: "TEXT", notnull: 1, dflt_value: null, pk: 0 },
      { cid: 18, name: "last_run_error", type: "TEXT", notnull: 0, dflt_value: null, pk: 0 },
      { cid: 19, name: "run_count", type: "INTEGER", notnull: 1, dflt_value: null, pk: 0 },
    ],
  },
] as const;
const expectedIndexes = [
  {
    name: "idx_auth_pairing_links_active",
    sql: "CREATE INDEX idx_auth_pairing_links_active\n    ON auth_pairing_links(revoked_at, consumed_at, expires_at)",
    columns: [
      { seqno: 0, cid: 9, name: "revoked_at" },
      { seqno: 1, cid: 8, name: "consumed_at" },
      { seqno: 2, cid: 7, name: "expires_at" },
    ],
  },
  {
    name: "idx_auth_sessions_active",
    sql: "CREATE INDEX idx_auth_sessions_active\n    ON auth_sessions(revoked_at, expires_at, issued_at)",
    columns: [
      { seqno: 0, cid: 13, name: "revoked_at" },
      { seqno: 1, cid: 11, name: "expires_at" },
      { seqno: 2, cid: 10, name: "issued_at" },
    ],
  },
  {
    name: "idx_checkpoint_diff_blobs_thread_to_turn",
    sql: "CREATE INDEX idx_checkpoint_diff_blobs_thread_to_turn\n    ON checkpoint_diff_blobs(thread_id, to_turn_count)",
    columns: [
      { seqno: 0, cid: 0, name: "thread_id" },
      { seqno: 1, cid: 2, name: "to_turn_count" },
    ],
  },
  {
    name: "idx_orch_command_receipts_aggregate",
    sql: "CREATE INDEX idx_orch_command_receipts_aggregate\n    ON orchestration_command_receipts(aggregate_kind, aggregate_id)",
    columns: [
      { seqno: 0, cid: 1, name: "aggregate_kind" },
      { seqno: 1, cid: 2, name: "aggregate_id" },
    ],
  },
  {
    name: "idx_orch_command_receipts_sequence",
    sql: "CREATE INDEX idx_orch_command_receipts_sequence\n    ON orchestration_command_receipts(result_sequence)",
    columns: [{ seqno: 0, cid: 4, name: "result_sequence" }],
  },
  {
    name: "idx_orch_events_command_id",
    sql: "CREATE INDEX idx_orch_events_command_id\n    ON orchestration_events(command_id)",
    columns: [{ seqno: 0, cid: 7, name: "command_id" }],
  },
  {
    name: "idx_orch_events_correlation_id",
    sql: "CREATE INDEX idx_orch_events_correlation_id\n    ON orchestration_events(correlation_id)",
    columns: [{ seqno: 0, cid: 9, name: "correlation_id" }],
  },
  {
    name: "idx_orch_events_stream_sequence",
    sql: "CREATE INDEX idx_orch_events_stream_sequence\n    ON orchestration_events(aggregate_kind, stream_id, sequence)",
    columns: [
      { seqno: 0, cid: 2, name: "aggregate_kind" },
      { seqno: 1, cid: 3, name: "stream_id" },
      { seqno: 2, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "idx_orch_events_stream_version",
    sql: "CREATE UNIQUE INDEX idx_orch_events_stream_version\n    ON orchestration_events(aggregate_kind, stream_id, stream_version)",
    columns: [
      { seqno: 0, cid: 2, name: "aggregate_kind" },
      { seqno: 1, cid: 3, name: "stream_id" },
      { seqno: 2, cid: 4, name: "stream_version" },
    ],
  },
  {
    name: "idx_orchestration_events_agent_stream_sequence",
    sql: "CREATE INDEX idx_orchestration_events_agent_stream_sequence\n    ON orchestration_events(stream_id, sequence)\n    WHERE application_event_version = 2 AND aggregate_kind = 'thread'",
    columns: [
      { seqno: 0, cid: 3, name: "stream_id" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "idx_orchestration_events_application_high_water",
    sql: "CREATE INDEX idx_orchestration_events_application_high_water\n    ON orchestration_events(sequence)\n    WHERE aggregate_kind = 'project'\n      OR (application_event_version = 2 AND aggregate_kind = 'thread')",
    columns: [{ seqno: 0, cid: 0, name: "sequence" }],
  },
  {
    name: "idx_orchestration_events_application_sequence",
    sql: "CREATE INDEX idx_orchestration_events_application_sequence\n    ON orchestration_events(application_event_version, sequence)",
    columns: [
      { seqno: 0, cid: 13, name: "application_event_version" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "idx_projection_pending_approvals_thread_status",
    sql: "CREATE INDEX idx_projection_pending_approvals_thread_status\n    ON projection_pending_approvals(thread_id, status)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 3, name: "status" },
    ],
  },
  {
    name: "idx_projection_projects_updated_at",
    sql: "CREATE INDEX idx_projection_projects_updated_at\n    ON projection_projects(updated_at)",
    columns: [{ seqno: 0, cid: 5, name: "updated_at" }],
  },
  {
    name: "idx_projection_projects_workspace_root_deleted_at",
    sql: "CREATE INDEX idx_projection_projects_workspace_root_deleted_at\n    ON projection_projects(workspace_root, deleted_at)",
    columns: [
      { seqno: 0, cid: 2, name: "workspace_root" },
      { seqno: 1, cid: 6, name: "deleted_at" },
    ],
  },
  {
    name: "idx_projection_thread_activities_thread_created",
    sql: "CREATE INDEX idx_projection_thread_activities_thread_created\n    ON projection_thread_activities(thread_id, created_at)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 7, name: "created_at" },
    ],
  },
  {
    name: "idx_projection_thread_activities_thread_sequence",
    sql: "CREATE INDEX idx_projection_thread_activities_thread_sequence\n    ON projection_thread_activities(thread_id, sequence)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 8, name: "sequence" },
    ],
  },
  {
    name: "idx_projection_thread_activities_thread_sequence_created_id",
    sql: "CREATE INDEX idx_projection_thread_activities_thread_sequence_created_id\n    ON projection_thread_activities(thread_id, sequence, created_at, activity_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 8, name: "sequence" },
      { seqno: 2, cid: 7, name: "created_at" },
      { seqno: 3, cid: 0, name: "activity_id" },
    ],
  },
  {
    name: "idx_projection_thread_messages_thread_created",
    sql: "CREATE INDEX idx_projection_thread_messages_thread_created\n    ON projection_thread_messages(thread_id, created_at)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 6, name: "created_at" },
    ],
  },
  {
    name: "idx_projection_thread_messages_thread_created_id",
    sql: "CREATE INDEX idx_projection_thread_messages_thread_created_id\n    ON projection_thread_messages(thread_id, created_at, message_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 6, name: "created_at" },
      { seqno: 2, cid: 0, name: "message_id" },
    ],
  },
  {
    name: "idx_projection_thread_proposed_plans_thread_created",
    sql: "CREATE INDEX idx_projection_thread_proposed_plans_thread_created\n    ON projection_thread_proposed_plans(thread_id, created_at)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 4, name: "created_at" },
    ],
  },
  {
    name: "idx_projection_thread_pull_requests_pr",
    sql: "CREATE INDEX idx_projection_thread_pull_requests_pr\n    ON projection_thread_pull_requests(host, repository, number)",
    columns: [
      { seqno: 0, cid: 1, name: "host" },
      { seqno: 1, cid: 2, name: "repository" },
      { seqno: 2, cid: 3, name: "number" },
    ],
  },
  {
    name: "idx_projection_thread_sessions_instance",
    sql: "CREATE INDEX idx_projection_thread_sessions_instance\n    ON projection_thread_sessions(provider_instance_id)",
    columns: [{ seqno: 0, cid: 9, name: "provider_instance_id" }],
  },
  {
    name: "idx_projection_thread_sessions_provider_session",
    sql: "CREATE INDEX idx_projection_thread_sessions_provider_session\n    ON projection_thread_sessions(provider_session_id)",
    columns: [{ seqno: 0, cid: 3, name: "provider_session_id" }],
  },
  {
    name: "idx_projection_threads_project_archived_at",
    sql: "CREATE INDEX idx_projection_threads_project_archived_at\n    ON projection_threads(project_id, archived_at)",
    columns: [
      { seqno: 0, cid: 1, name: "project_id" },
      { seqno: 1, cid: 12, name: "archived_at" },
    ],
  },
  {
    name: "idx_projection_threads_project_deleted_created",
    sql: "CREATE INDEX idx_projection_threads_project_deleted_created\n    ON projection_threads(project_id, deleted_at, created_at)",
    columns: [
      { seqno: 0, cid: 1, name: "project_id" },
      { seqno: 1, cid: 8, name: "deleted_at" },
      { seqno: 2, cid: 6, name: "created_at" },
    ],
  },
  {
    name: "idx_projection_threads_project_id",
    sql: "CREATE INDEX idx_projection_threads_project_id\n    ON projection_threads(project_id)",
    columns: [{ seqno: 0, cid: 1, name: "project_id" }],
  },
  {
    name: "idx_projection_threads_shell_active",
    sql: "CREATE INDEX idx_projection_threads_shell_active\n    ON projection_threads(deleted_at, archived_at, project_id, created_at, thread_id)",
    columns: [
      { seqno: 0, cid: 8, name: "deleted_at" },
      { seqno: 1, cid: 12, name: "archived_at" },
      { seqno: 2, cid: 1, name: "project_id" },
      { seqno: 3, cid: 6, name: "created_at" },
      { seqno: 4, cid: 0, name: "thread_id" },
    ],
  },
  {
    name: "idx_projection_threads_shell_archived",
    sql: "CREATE INDEX idx_projection_threads_shell_archived\n    ON projection_threads(deleted_at, archived_at, project_id, thread_id)",
    columns: [
      { seqno: 0, cid: 8, name: "deleted_at" },
      { seqno: 1, cid: 12, name: "archived_at" },
      { seqno: 2, cid: 1, name: "project_id" },
      { seqno: 3, cid: 0, name: "thread_id" },
    ],
  },
  {
    name: "idx_projection_turns_thread_checkpoint_completed",
    sql: "CREATE INDEX idx_projection_turns_thread_checkpoint_completed\n    ON projection_turns(thread_id, checkpoint_turn_count, completed_at)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 9, name: "checkpoint_turn_count" },
      { seqno: 2, cid: 8, name: "completed_at" },
    ],
  },
  {
    name: "idx_projection_turns_thread_keyset",
    sql: "CREATE INDEX idx_projection_turns_thread_keyset\n    ON projection_turns(thread_id, requested_at, turn_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 6, name: "requested_at" },
      { seqno: 2, cid: 2, name: "turn_id" },
    ],
  },
  {
    name: "idx_projection_turns_thread_requested",
    sql: "CREATE INDEX idx_projection_turns_thread_requested\n    ON projection_turns(thread_id, requested_at)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 6, name: "requested_at" },
    ],
  },
  {
    name: "idx_provider_session_runtime_instance",
    sql: "CREATE INDEX idx_provider_session_runtime_instance\n    ON provider_session_runtime(provider_instance_id)",
    columns: [{ seqno: 0, cid: 8, name: "provider_instance_id" }],
  },
  {
    name: "idx_provider_session_runtime_provider",
    sql: "CREATE INDEX idx_provider_session_runtime_provider\n    ON provider_session_runtime(provider_name)",
    columns: [{ seqno: 0, cid: 1, name: "provider_name" }],
  },
  {
    name: "idx_provider_session_runtime_status",
    sql: "CREATE INDEX idx_provider_session_runtime_status\n    ON provider_session_runtime(status)",
    columns: [{ seqno: 0, cid: 4, name: "status" }],
  },
  {
    name: "idx_scheduled_tasks_due",
    sql: "CREATE INDEX idx_scheduled_tasks_due\n    ON scheduled_tasks(enabled, next_run_at)\n    WHERE enabled = 1 AND next_run_at IS NOT NULL",
    columns: [
      { seqno: 0, cid: 3, name: "enabled" },
      { seqno: 1, cid: 15, name: "next_run_at" },
    ],
  },
  {
    name: "idx_scheduled_tasks_project",
    sql: "CREATE INDEX idx_scheduled_tasks_project\n    ON scheduled_tasks(project_id, updated_at)",
    columns: [
      { seqno: 0, cid: 5, name: "project_id" },
      { seqno: 1, cid: 14, name: "updated_at" },
    ],
  },
  {
    name: "orchestration_events_v2_created_threads_idx",
    sql: "CREATE INDEX orchestration_events_v2_created_threads_idx\n    ON orchestration_events(stream_id)\n    WHERE application_event_version = 2\n      AND aggregate_kind = 'thread'\n      AND event_type = 'thread.created'",
    columns: [{ seqno: 0, cid: 3, name: "stream_id" }],
  },
  {
    name: "orchestration_v2_command_receipts_thread_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_command_receipts_thread_sequence_idx ON orchestration_v2_command_receipts(thread_id, result_sequence)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 4, name: "result_sequence" },
    ],
  },
  {
    name: "orchestration_v2_effect_outbox_claim_idx",
    sql: "CREATE INDEX orchestration_v2_effect_outbox_claim_idx\n    ON orchestration_v2_effect_outbox(status, available_at, lease_expires_at, created_at)",
    columns: [
      { seqno: 0, cid: 5, name: "status" },
      { seqno: 1, cid: 7, name: "available_at" },
      { seqno: 2, cid: 9, name: "lease_expires_at" },
      { seqno: 3, cid: 10, name: "created_at" },
    ],
  },
  {
    name: "orchestration_v2_effect_outbox_command_idx",
    sql: "CREATE INDEX orchestration_v2_effect_outbox_command_idx\n    ON orchestration_v2_effect_outbox(command_id, effect_id)",
    columns: [
      { seqno: 0, cid: 1, name: "command_id" },
      { seqno: 1, cid: 0, name: "effect_id" },
    ],
  },
  {
    name: "orchestration_v2_effect_outbox_thread_status_idx",
    sql: "CREATE INDEX orchestration_v2_effect_outbox_thread_status_idx\n    ON orchestration_v2_effect_outbox(thread_id, status, effect_type)",
    columns: [
      { seqno: 0, cid: 2, name: "thread_id" },
      { seqno: 1, cid: 5, name: "status" },
      { seqno: 2, cid: 3, name: "effect_type" },
    ],
  },
  {
    name: "orchestration_v2_events_command_idx",
    sql: "CREATE INDEX orchestration_v2_events_command_idx ON orchestration_v2_events(command_id, sequence)",
    columns: [
      { seqno: 0, cid: 2, name: "command_id" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "orchestration_v2_events_instance_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_instance_sequence_idx ON orchestration_v2_events(provider_instance_id, sequence)",
    columns: [
      { seqno: 0, cid: 12, name: "provider_instance_id" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "orchestration_v2_events_node_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_node_sequence_idx ON orchestration_v2_events(node_id, sequence)",
    columns: [
      { seqno: 0, cid: 5, name: "node_id" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "orchestration_v2_events_raw_event_idx",
    sql: "CREATE INDEX orchestration_v2_events_raw_event_idx ON orchestration_v2_events(raw_event_id)",
    columns: [{ seqno: 0, cid: 7, name: "raw_event_id" }],
  },
  {
    name: "orchestration_v2_events_run_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_run_sequence_idx ON orchestration_v2_events(run_id, sequence)",
    columns: [
      { seqno: 0, cid: 4, name: "run_id" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "orchestration_v2_events_thread_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_thread_sequence_idx ON orchestration_v2_events(thread_id, sequence)",
    columns: [
      { seqno: 0, cid: 3, name: "thread_id" },
      { seqno: 1, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "orchestration_v2_events_thread_type_sequence_idx",
    sql: "CREATE INDEX orchestration_v2_events_thread_type_sequence_idx ON orchestration_v2_events(thread_id, event_type, sequence)",
    columns: [
      { seqno: 0, cid: 3, name: "thread_id" },
      { seqno: 1, cid: 8, name: "event_type" },
      { seqno: 2, cid: 0, name: "sequence" },
    ],
  },
  {
    name: "orchestration_v2_projection_checkpoint_scopes_parent_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoint_scopes_parent_idx ON orchestration_v2_projection_checkpoint_scopes(parent_scope_id)",
    columns: [{ seqno: 0, cid: 4, name: "parent_scope_id" }],
  },
  {
    name: "orchestration_v2_projection_checkpoint_scopes_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoint_scopes_thread_idx ON orchestration_v2_projection_checkpoint_scopes(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_checkpoints_parent_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoints_parent_idx ON orchestration_v2_projection_checkpoints(parent_checkpoint_id)",
    columns: [{ seqno: 0, cid: 5, name: "parent_checkpoint_id" }],
  },
  {
    name: "orchestration_v2_projection_checkpoints_scope_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_checkpoints_scope_ordinal_idx ON orchestration_v2_projection_checkpoints(scope_id, ordinal_within_scope)",
    columns: [
      { seqno: 0, cid: 2, name: "scope_id" },
      { seqno: 1, cid: 6, name: "ordinal_within_scope" },
    ],
  },
  {
    name: "orchestration_v2_projection_checkpoints_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_checkpoints_thread_idx ON orchestration_v2_projection_checkpoints(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_context_handoffs_target_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_handoffs_target_run_idx ON orchestration_v2_projection_context_handoffs(target_run_id)",
    columns: [{ seqno: 0, cid: 2, name: "target_run_id" }],
  },
  {
    name: "orchestration_v2_projection_context_handoffs_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_handoffs_thread_idx ON orchestration_v2_projection_context_handoffs(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_context_transfers_source_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_transfers_source_thread_idx ON orchestration_v2_projection_context_transfers(source_thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "source_thread_id" }],
  },
  {
    name: "orchestration_v2_projection_context_transfers_target_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_transfers_target_run_idx ON orchestration_v2_projection_context_transfers(target_run_id)",
    columns: [{ seqno: 0, cid: 3, name: "target_run_id" }],
  },
  {
    name: "orchestration_v2_projection_context_transfers_target_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_context_transfers_target_thread_idx ON orchestration_v2_projection_context_transfers(target_thread_id, status)",
    columns: [
      { seqno: 0, cid: 2, name: "target_thread_id" },
      { seqno: 1, cid: 5, name: "status" },
    ],
  },
  {
    name: "orchestration_v2_projection_messages_latest_user_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_latest_user_idx\n    ON orchestration_v2_projection_messages(thread_id, updated_at DESC, message_id DESC)\n    WHERE role = 'user'",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 7, name: "updated_at" },
      { seqno: 2, cid: 0, name: "message_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_messages_node_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_node_idx ON orchestration_v2_projection_messages(node_id)",
    columns: [{ seqno: 0, cid: 3, name: "node_id" }],
  },
  {
    name: "orchestration_v2_projection_messages_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_run_idx ON orchestration_v2_projection_messages(run_id)",
    columns: [{ seqno: 0, cid: 2, name: "run_id" }],
  },
  {
    name: "orchestration_v2_projection_messages_thread_created_idx",
    sql: "CREATE INDEX orchestration_v2_projection_messages_thread_created_idx ON orchestration_v2_projection_messages(thread_id, created_at, message_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 6, name: "created_at" },
      { seqno: 2, cid: 0, name: "message_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_nodes_parent_idx",
    sql: "CREATE INDEX orchestration_v2_projection_nodes_parent_idx ON orchestration_v2_projection_nodes(parent_node_id)",
    columns: [{ seqno: 0, cid: 3, name: "parent_node_id" }],
  },
  {
    name: "orchestration_v2_projection_nodes_provider_turn_idx",
    sql: "CREATE INDEX orchestration_v2_projection_nodes_provider_turn_idx ON orchestration_v2_projection_nodes(provider_turn_id)",
    columns: [{ seqno: 0, cid: 8, name: "provider_turn_id" }],
  },
  {
    name: "orchestration_v2_projection_nodes_thread_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_nodes_thread_run_idx ON orchestration_v2_projection_nodes(thread_id, run_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 2, name: "run_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_plans_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_plans_run_idx ON orchestration_v2_projection_plans(run_id)",
    columns: [{ seqno: 0, cid: 2, name: "run_id" }],
  },
  {
    name: "orchestration_v2_projection_plans_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_plans_thread_idx ON orchestration_v2_projection_plans(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_session_bindings_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_session_bindings_thread_idx\n    ON orchestration_v2_projection_provider_session_bindings(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_sessions_instance_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_sessions_instance_status_idx ON orchestration_v2_projection_provider_sessions(provider_instance_id, status)",
    columns: [
      { seqno: 0, cid: 8, name: "provider_instance_id" },
      { seqno: 1, cid: 3, name: "status" },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_sessions_provider_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_sessions_provider_status_idx ON orchestration_v2_projection_provider_sessions(provider, status)",
    columns: [
      { seqno: 0, cid: 2, name: "provider" },
      { seqno: 1, cid: 3, name: "status" },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_sessions_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_sessions_thread_idx ON orchestration_v2_projection_provider_sessions(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_threads_instance_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_instance_status_idx ON orchestration_v2_projection_provider_threads(provider_instance_id, status)",
    columns: [
      { seqno: 0, cid: 11, name: "provider_instance_id" },
      { seqno: 1, cid: 5, name: "status" },
    ],
  },
  {
    name: "orchestration_v2_projection_provider_threads_owner_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_owner_idx ON orchestration_v2_projection_provider_threads(owner_node_id)",
    columns: [{ seqno: 0, cid: 2, name: "owner_node_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_threads_session_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_session_idx ON orchestration_v2_projection_provider_threads(provider_session_id)",
    columns: [{ seqno: 0, cid: 4, name: "provider_session_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_threads_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_threads_thread_idx ON orchestration_v2_projection_provider_threads(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_turns_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_provider_turns_thread_idx ON orchestration_v2_projection_provider_turns(thread_id)",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_provider_turns_thread_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_provider_turns_thread_ordinal_idx ON orchestration_v2_projection_provider_turns(provider_thread_id, ordinal)",
    columns: [
      { seqno: 0, cid: 2, name: "provider_thread_id" },
      { seqno: 1, cid: 5, name: "ordinal" },
    ],
  },
  {
    name: "orchestration_v2_projection_requests_recovery_idx",
    sql: "CREATE INDEX orchestration_v2_projection_requests_recovery_idx\n    ON orchestration_v2_projection_runtime_requests(thread_id)\n    WHERE status = 'pending'",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_run_attempts_run_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_run_attempts_run_ordinal_idx ON orchestration_v2_projection_run_attempts(run_id, attempt_ordinal)",
    columns: [
      { seqno: 0, cid: 2, name: "run_id" },
      { seqno: 1, cid: 3, name: "attempt_ordinal" },
    ],
  },
  {
    name: "orchestration_v2_projection_run_attempts_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_run_attempts_thread_idx ON orchestration_v2_projection_run_attempts(thread_id, run_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 2, name: "run_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_runs_provider_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runs_provider_thread_idx ON orchestration_v2_projection_runs(provider_thread_id)",
    columns: [{ seqno: 0, cid: 4, name: "provider_thread_id" }],
  },
  {
    name: "orchestration_v2_projection_runs_recovery_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runs_recovery_idx\n    ON orchestration_v2_projection_runs(status, thread_id)\n    WHERE status IN ('queued', 'preparing', 'starting', 'running', 'waiting')",
    columns: [
      { seqno: 0, cid: 5, name: "status" },
      { seqno: 1, cid: 1, name: "thread_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_runs_thread_ordinal_idx",
    sql: "CREATE UNIQUE INDEX orchestration_v2_projection_runs_thread_ordinal_idx ON orchestration_v2_projection_runs(thread_id, ordinal)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 2, name: "ordinal" },
    ],
  },
  {
    name: "orchestration_v2_projection_runs_thread_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runs_thread_status_idx ON orchestration_v2_projection_runs(thread_id, status)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 5, name: "status" },
    ],
  },
  {
    name: "orchestration_v2_projection_runtime_requests_provider_turn_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runtime_requests_provider_turn_idx ON orchestration_v2_projection_runtime_requests(provider_turn_id)",
    columns: [{ seqno: 0, cid: 3, name: "provider_turn_id" }],
  },
  {
    name: "orchestration_v2_projection_runtime_requests_thread_status_idx",
    sql: "CREATE INDEX orchestration_v2_projection_runtime_requests_thread_status_idx ON orchestration_v2_projection_runtime_requests(thread_id, status)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 5, name: "status" },
    ],
  },
  {
    name: "orchestration_v2_projection_subagents_child_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_child_thread_idx ON orchestration_v2_projection_subagents(child_thread_id)",
    columns: [{ seqno: 0, cid: 6, name: "child_thread_id" }],
  },
  {
    name: "orchestration_v2_projection_subagents_parent_node_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_parent_node_idx ON orchestration_v2_projection_subagents(parent_node_id)",
    columns: [{ seqno: 0, cid: 3, name: "parent_node_id" }],
  },
  {
    name: "orchestration_v2_projection_subagents_provider_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_provider_thread_idx ON orchestration_v2_projection_subagents(provider_thread_id)",
    columns: [{ seqno: 0, cid: 5, name: "provider_thread_id" }],
  },
  {
    name: "orchestration_v2_projection_subagents_thread_idx",
    sql: "CREATE INDEX orchestration_v2_projection_subagents_thread_idx ON orchestration_v2_projection_subagents(thread_id, started_at, subagent_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 9, name: "started_at" },
      { seqno: 2, cid: 0, name: "subagent_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_threads_project_updated_idx",
    sql: "CREATE INDEX orchestration_v2_projection_threads_project_updated_idx ON orchestration_v2_projection_threads(project_id, updated_at)",
    columns: [
      { seqno: 0, cid: 1, name: "project_id" },
      { seqno: 1, cid: 8, name: "updated_at" },
    ],
  },
  {
    name: "orchestration_v2_projection_turn_items_node_ordinal_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_node_ordinal_idx ON orchestration_v2_projection_turn_items(node_id, ordinal)",
    columns: [
      { seqno: 0, cid: 3, name: "node_id" },
      { seqno: 1, cid: 7, name: "ordinal" },
    ],
  },
  {
    name: "orchestration_v2_projection_turn_items_provider_turn_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_provider_turn_idx ON orchestration_v2_projection_turn_items(provider_turn_id)",
    columns: [{ seqno: 0, cid: 5, name: "provider_turn_id" }],
  },
  {
    name: "orchestration_v2_projection_turn_items_recovery_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_recovery_idx\n    ON orchestration_v2_projection_turn_items(thread_id)\n    WHERE type IN ('command_execution', 'dynamic_tool', 'subagent')\n      AND status IN ('pending', 'running', 'waiting')",
    columns: [{ seqno: 0, cid: 1, name: "thread_id" }],
  },
  {
    name: "orchestration_v2_projection_turn_items_run_ordinal_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_run_ordinal_idx ON orchestration_v2_projection_turn_items(run_id, ordinal)",
    columns: [
      { seqno: 0, cid: 2, name: "run_id" },
      { seqno: 1, cid: 7, name: "ordinal" },
    ],
  },
  {
    name: "orchestration_v2_projection_turn_items_shell_pending_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_shell_pending_idx\n    ON orchestration_v2_projection_turn_items(thread_id, run_id)\n    WHERE type IN ('command_execution', 'dynamic_tool', 'subagent')\n      AND status NOT IN ('completed', 'interrupted', 'failed', 'cancelled')",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 2, name: "run_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_turn_items_thread_ordinal_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_thread_ordinal_idx ON orchestration_v2_projection_turn_items(thread_id, ordinal, turn_item_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 7, name: "ordinal" },
      { seqno: 2, cid: 0, name: "turn_item_id" },
    ],
  },
  {
    name: "orchestration_v2_projection_turn_items_thread_run_idx",
    sql: "CREATE INDEX orchestration_v2_projection_turn_items_thread_run_idx\n    ON orchestration_v2_projection_turn_items(thread_id, run_id)",
    columns: [
      { seqno: 0, cid: 1, name: "thread_id" },
      { seqno: 1, cid: 2, name: "run_id" },
    ],
  },
] as const;

layer("current baseline", (it) => {
  it.effect("initializes the complete current schema exactly once", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      assert.deepStrictEqual(
        migrationEntries.map(([id, name]) => [id, name]),
        [[1, "CurrentBaseline"]],
      );

      const executed = yield* runMigrations();
      assert.deepStrictEqual(executed, [[1, "CurrentBaseline"]]);
      assert.deepStrictEqual(yield* runMigrations(), []);

      const objects = yield* sql<{
        readonly type: string;
        readonly name: string;
        readonly sql: string;
      }>`
        SELECT type, name, sql
        FROM sqlite_master
        WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
        ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name
      `;
      assert.deepStrictEqual(objects, expectedObjects);

      const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
      for (const table of expectedTables) {
        const columns = yield* sql.unsafe(`PRAGMA table_info(${quoteIdentifier(table.name)})`)
          .unprepared;
        assert.deepStrictEqual(columns, table.columns);
      }

      for (const index of expectedIndexes) {
        const columns = yield* sql.unsafe(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
          .unprepared;
        assert.deepStrictEqual(columns, index.columns);
      }

      const migrationRows = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
      `;
      assert.deepStrictEqual(migrationRows, [{ migration_id: 1, name: "CurrentBaseline" }]);

      const metadata = yield* sql<{
        readonly projection_name: string;
        readonly schema_version: number;
        readonly last_sequence: number;
        readonly updated_at: string;
      }>`
        SELECT projection_name, schema_version, last_sequence, updated_at
        FROM orchestration_v2_projection_metadata
      `;
      assert.equal(metadata.length, 1);
      assert.equal(metadata[0]?.projection_name, "thread-projections");
      assert.equal(metadata[0]?.schema_version, 1);
      assert.equal(metadata[0]?.last_sequence, 0);
      assert.match(metadata[0]?.updated_at ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }),
  );
});
