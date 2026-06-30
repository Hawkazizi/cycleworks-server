export async function up(knex) {
  await knex.schema.alterTable("weekly_loading_plans", (table) => {
    table.timestamp("reviewed_at", { useTz: true }).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("weekly_loading_plans", (table) => {
    table.dropColumn("reviewed_at");
  });
}
