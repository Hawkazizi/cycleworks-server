export async function up(knex) {
  await knex.schema.createTable("packing_units", (table) => {
    table.increments("id").primary();
    table.string("name", 150).notNullable();
    table
      .integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.text("address");
    table.string("status", 20).notNullable().defaultTo("Draft");
    table.text("rejection_reason");
    table.integer("reviewed_by").references("id").inTable("users");
    table.timestamp("reviewed_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
    table.text("document_1");
    table.text("document_2");

    // Status check (PostgreSQL only)
    table.check(`status IN ('Draft', 'Submitted', 'Approved', 'Rejected')`);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("packing_units");
}
