export function up(knex) {
  return knex.schema.alterTable(
    "container_tracking_statuses",
    function (table) {
      // Drop the unique constraint on container_id and tracking_code
      table.dropUnique(
        ["container_id", "tracking_code"],
        "unique_container_tracking",
      );
    },
  );
}

export function down(knex) {
  return knex.schema.alterTable(
    "container_tracking_statuses",
    function (table) {
      // Recreate the unique constraint if rolling back the migration
      table.unique(["container_id", "tracking_code"]);
    },
  );
}
