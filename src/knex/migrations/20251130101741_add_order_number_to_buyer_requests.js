export async function up(knex) {
  await knex.schema.table("buyer_requests", (table) => {
    table.string("order_number", 100).nullable().defaultTo(null);
  });
}

export async function down(knex) {
  await knex.schema.table("buyer_requests", (table) => {
    table.dropColumn("order_number");
  });
}
