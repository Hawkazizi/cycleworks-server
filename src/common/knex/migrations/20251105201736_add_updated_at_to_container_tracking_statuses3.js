// migrations/20251105_add_unique_container_tracking.js
export async function up(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.unique(
      ["container_id", "tracking_code"],
      "unique_container_tracking",
    );
  });
}

export async function down(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropUnique(
      ["container_id", "tracking_code"],
      "unique_container_tracking",
    );
  });
}
