export async function up(knex) {
  await knex.schema.createTable("admin_license_keys", (table) => {
    table.increments("id").primary();
    table.string("key", 100).notNullable().unique();
    table
      .integer("role_id")
      .notNullable()
      .references("id")
      .inTable("roles")
      .onDelete("CASCADE");
    table.boolean("is_active").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("admin_license_keys");
}
