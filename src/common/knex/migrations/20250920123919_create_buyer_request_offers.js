export async function up(knex) {
  await knex.schema.createTable("buyer_request_offers", (table) => {
    table.increments("id").primary();
    table
      .integer("request_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("buyer_requests")
      .onDelete("CASCADE");

    table
      .integer("farmer_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.decimal("offer_quantity", 10, 2).notNullable(); // in KG

    table.string("status", 20).defaultTo("pending");
    // pending → accepted → rejected

    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("buyer_request_offers");
}
