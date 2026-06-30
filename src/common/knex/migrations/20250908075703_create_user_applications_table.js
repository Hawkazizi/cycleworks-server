export async function up(knex) {
  await knex.schema.createTable("user_applications", (table) => {
    table.increments("id").primary();
    table
      .integer("user_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.text("reason").notNullable();
    table.string("status", 20).defaultTo("pending");
    table
      .integer("reviewed_by")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("reviewed_at");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("user_applications");
}
