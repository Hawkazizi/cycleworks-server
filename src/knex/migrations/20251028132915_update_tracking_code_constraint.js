/**
 * @fileoverview
 * Migration: make tracking_code unique per container, not globally.
 *
 * Old constraint: UNIQUE ("tracking_code")
 * New constraint: UNIQUE ("container_id", "tracking_code")
 */

export async function up(knex) {
  // Step 1️⃣: Drop old unique constraint if it exists
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropUnique(
      ["tracking_code"],
      "container_tracking_statuses_tracking_code_unique",
    );
  });

  // Step 2️⃣: Add composite unique constraint (container_id + tracking_code)
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.unique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });
}

export async function down(knex) {
  // Rollback: remove the composite unique constraint and restore old one
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropUnique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });

  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.unique(
      ["tracking_code"],
      "container_tracking_statuses_tracking_code_unique",
    );
  });
}
