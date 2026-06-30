export async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("updated_at");
  });
}
