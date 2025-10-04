export async function up(knex) {
  await knex.schema.createTable("buyer_request_suppliers", (table) => {
    table.increments("id").primary();
    table
      .integer("buyer_request_id")
      .notNullable()
      .references("id")
      .inTable("buyer_requests")
      .onDelete("CASCADE");
    table
      .integer("supplier_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.decimal("share_percentage", 5, 2).defaultTo(0); // optional tonnage split
    table
      .integer("assigned_by")
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("SET NULL");
    table.timestamp("assigned_at").defaultTo(knex.fn.now());
    table.unique(["buyer_request_id", "supplier_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("buyer_request_suppliers");
}
