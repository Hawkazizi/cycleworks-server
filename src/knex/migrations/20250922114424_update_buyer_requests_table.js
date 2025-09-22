export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (t) => {
    t.dropColumn("product");
    t.dropColumn("destination_country");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (t) => {
    t.string("product", 100).defaultTo("eggs");
    t.string("destination_country", 100);
  });
}
