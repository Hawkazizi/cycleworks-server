export async function up(knex) {
  await knex.schema.createTable("user_roles", (table) => {
    table
      .integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table
      .integer("role_id")
      .notNullable()
      .references("id")
      .inTable("roles")
      .onDelete("CASCADE");
    table.primary(["user_id", "role_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("user_roles");
}
