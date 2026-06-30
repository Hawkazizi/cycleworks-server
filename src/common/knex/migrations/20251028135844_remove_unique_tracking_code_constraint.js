export async function up(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropUnique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });
}

export async function down(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.unique(
      ["container_id", "tracking_code"],
      "unique_tracking_code_per_container",
    );
  });
}
