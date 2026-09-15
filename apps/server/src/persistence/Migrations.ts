/**
 * Fresh-install migration runner.
 *
 * This fork intentionally has no existing-database upgrade path. An empty
 * database receives the complete current schema in one baseline migration.
 */

import * as Effect from "effect/Effect";
import * as Migrator from "effect/unstable/sql/Migrator";

import CurrentBaseline from "./Migrations/001_CurrentBaseline.ts";

export const migrationEntries = [[1, "CurrentBaseline", CurrentBaseline]] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

const run = Migrator.make({});

export const runMigrations = Effect.fn("runMigrations")(function* () {
  const executedMigrations = yield* run({
    loader: Migrator.fromRecord({ "1_CurrentBaseline": CurrentBaseline }),
  });
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log("Migrations ran successfully").pipe(Effect.annotateLogs({ migrations }));
  return executedMigrations;
});
