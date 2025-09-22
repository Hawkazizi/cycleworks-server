export async function up(knex) {
  await knex.schema.alterTable("buyer_request_offers", (table) => {
    table.unique(["request_id", "farmer_id"], "unique_request_farmer");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_request_offers", (table) => {
    table.dropUnique(["request_id", "farmer_id"], "unique_request_farmer");
  });
}
