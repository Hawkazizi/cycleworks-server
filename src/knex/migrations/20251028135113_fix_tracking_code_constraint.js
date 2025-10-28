export async function up(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // Drop the composite unique constraint
    table.dropUnique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });

  // Add a single-column unique constraint (global uniqueness)
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.unique(["tracking_code"], "unique_tracking_code_global");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // Drop global uniqueness
    table.dropUnique(["tracking_code"], "unique_tracking_code_global");
  });

  // Revert back to composite unique (not recommended)
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.unique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });
}
