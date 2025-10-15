export async function up(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    // new column
    table.string("tracking_code", 100).unique().index().nullable();

    // optional: comment for clarity (Postgres supports comments)
    table.comment(
      "tracking_code",
      "Unique code assigned for tracking container status"
    );
  });
}

export async function down(knex) {
  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropColumn("tracking_code");
  });
}
