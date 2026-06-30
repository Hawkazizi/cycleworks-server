export async function up(knex) {
  // Drop the offers table (no longer used)
  await knex.schema.dropTableIfExists("buyer_request_offers");
}

export async function down(knex) {
  // Recreate buyer_request_offers if rollback is needed
  await knex.schema.createTable("buyer_request_offers", (table) => {
    table.increments("id").primary();
    table
      .integer("request_id")
      .notNullable()
      .references("id")
      .inTable("buyer_requests")
      .onDelete("CASCADE");
    table
      .integer("farmer_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.decimal("offer_quantity").notNullable();
    table.string("status", 20).defaultTo("pending");
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.unique(["request_id", "farmer_id"]);
  });
}
