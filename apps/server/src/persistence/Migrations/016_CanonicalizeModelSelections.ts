import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Canonicalize the pre-`modelSelection` storage into the current
 * `{ provider, model, options }` shape.
 *
 * Provider resolution is deliberately data-driven rather than a fixed table:
 *
 *   - an explicit legacy `defaultProvider` / `provider` / `provider_name` is
 *     preserved verbatim, so rows written by drivers this build no longer
 *     ships keep pointing at the driver that wrote them (the registry surfaces
 *     those instances as `unavailable` instead of failing to decode), and
 *   - everything else resolves to `claudeAgent`, the surviving first-party
 *     default. This bucket used to be filled by whatever driver the model slug
 *     did not name; it now lands on Claude rather than on a removed kind.
 *
 * Per-provider option blobs (`defaultModelOptions` / `modelOptions` keyed by
 * provider kind) are read back through the resolved provider's own key; a flat
 * options object is passed through unchanged. Legacy blobs keyed only by a
 * removed kind therefore fall through as a flat object rather than being
 * rewritten under a provider this build does not know.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN default_model_selection_json TEXT
  `;

  yield* sql`
    UPDATE projection_projects
    SET default_model_selection_json = CASE
      WHEN default_model IS NULL THEN NULL
      ELSE json_object('provider', 'claudeAgent', 'model', default_model)
    END
    WHERE default_model_selection_json IS NULL
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN model_selection_json TEXT
  `;

  yield* sql`
    UPDATE projection_threads
    SET model_selection_json = json_object(
      'provider',
      COALESCE(
        (
          SELECT provider_name
          FROM projection_thread_sessions
          WHERE projection_thread_sessions.thread_id = projection_threads.thread_id
        ),
        'claudeAgent'
      ),
      'model',
      model
    )
    WHERE model_selection_json IS NULL
  `;

  yield* sql`
    ALTER TABLE projection_projects
    DROP COLUMN default_model
  `;

  yield* sql`
    ALTER TABLE projection_threads
    DROP COLUMN model
  `;

  yield* sql`
    UPDATE orchestration_events
    SET payload_json = CASE
      WHEN json_type(payload_json, '$.defaultModel') = 'null' THEN json_remove(
        json_set(payload_json, '$.defaultModelSelection', json('null')),
        '$.defaultProvider',
        '$.defaultModel',
        '$.defaultModelOptions'
      )
      ELSE json_remove(
        json_set(
          payload_json,
          '$.defaultModelSelection',
          json_patch(
            json_object(
              'provider',
              COALESCE(json_extract(payload_json, '$.defaultProvider'), 'claudeAgent'),
              'model',
              json_extract(payload_json, '$.defaultModel')
            ),
            CASE
              WHEN json_type(payload_json, '$.defaultModelOptions') IS NULL THEN '{}'
              WHEN json_type(payload_json, '$.defaultModelOptions.claudeAgent') IS NOT NULL
              THEN json_object(
                'options',
                json(json_extract(payload_json, '$.defaultModelOptions.claudeAgent'))
              )
              ELSE json_object(
                'options',
                json(json_extract(payload_json, '$.defaultModelOptions'))
              )
            END
          )
        ),
        '$.defaultProvider',
        '$.defaultModel',
        '$.defaultModelOptions'
      )
    END
    WHERE event_type IN ('project.created', 'project.meta-updated')
      AND json_type(payload_json, '$.defaultModelSelection') IS NULL
      AND json_type(payload_json, '$.defaultModel') IS NOT NULL
  `;

  yield* sql`
    UPDATE orchestration_events
    SET payload_json = json_remove(
      json_set(
        payload_json,
        '$.modelSelection',
        json_patch(
          json_object(
            'provider',
            COALESCE(json_extract(payload_json, '$.provider'), 'claudeAgent'),
            'model',
            json_extract(payload_json, '$.model')
          ),
          CASE
            WHEN json_type(payload_json, '$.modelOptions') IS NULL THEN '{}'
            WHEN json_type(payload_json, '$.modelOptions.claudeAgent') IS NOT NULL
            THEN json_object(
              'options',
              json(json_extract(payload_json, '$.modelOptions.claudeAgent'))
            )
            ELSE json_object('options', json(json_extract(payload_json, '$.modelOptions')))
          END
        )
      ),
      '$.provider',
      '$.model',
      '$.modelOptions'
    )
    WHERE event_type IN ('thread.created', 'thread.meta-updated', 'thread.turn-start-requested')
      AND json_type(payload_json, '$.modelSelection') IS NULL
      AND json_type(payload_json, '$.model') IS NOT NULL
  `;

  // Backfill thread.created events that predate the model field entirely
  yield* sql`
    UPDATE orchestration_events
    SET payload_json = json_set(
      payload_json,
      '$.modelSelection',
      json(json_object('provider', 'claudeAgent', 'model', 'gpt-5.4'))
    )
    WHERE event_type = 'thread.created'
      AND json_type(payload_json, '$.modelSelection') IS NULL
      AND json_type(payload_json, '$.model') IS NULL
  `;
});
