export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.integer("cartons").nullable().comment("Requested carton count");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("cartons");
  });
}
