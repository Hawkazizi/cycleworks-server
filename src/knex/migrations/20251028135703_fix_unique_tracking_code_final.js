export async function up(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // 1️⃣ Drop the global unique constraint
    table.dropUnique(["tracking_code"], "unique_tracking_code_global");
  });

  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // 2️⃣ Add unique constraint per container
    table.unique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });
}

export async function down(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // Drop the per-container unique constraint
    table.dropUnique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });

  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // Restore global uniqueness (not recommended)
    table.unique(["tracking_code"], "unique_tracking_code_global");
  });
}
