export async function up(knex) {
  await knex.schema.createTable("buyer_requests", (table) => {
    table.increments("id").primary();
    table
      .integer("buyer_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("buyers")
      .onDelete("CASCADE");

    table.string("product", 100).notNullable().defaultTo("eggs");
    table.decimal("quantity", 10, 2).notNullable(); // in KG
    table.string("destination_country", 100);

    table.string("status", 20).defaultTo("pending");
    // pending → accepted → rejected → matched → fulfilled

    table
      .integer("reviewed_by")
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("SET NULL");
    table.timestamp("reviewed_at");

    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("buyer_requests");
}
