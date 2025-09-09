export async function up(knex) {
  await knex.schema.createTable("settings", (table) => {
    table.string("key", 100).primary();
    table.text("value").notNullable();
    table.text("description");
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Seed sample data
  await knex("settings")
    .insert([
      {
        key: "submission_day",
        value: "Monday",
        description: "Day of week for weekly loading plan submission",
      },
      {
        key: "timeline_days",
        value: "7",
        description:
          "Days for production/loading timeline after permit issuance",
      },
    ])
    .onConflict("key")
    .merge();
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("settings");
}
