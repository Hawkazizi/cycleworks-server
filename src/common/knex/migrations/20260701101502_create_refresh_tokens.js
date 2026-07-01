export const up = (knex) => {
  return knex.schema.createTable("refresh_tokens", (table) => {
    // Changed from uuid to integer to match your DB's primary key style
    table.increments("id").primary();

    // Changed from uuid to integer to match the "users.id" column type
    table
      .integer("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.string("token").notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.boolean("is_revoked").defaultTo(false);
    table.timestamp("created_at").defaultTo(knex.fn.now());

    // Index for fast lookup during authentication
    table.index(["token", "is_revoked"]);
  });
};

export const down = (knex) => {
  return knex.schema.dropTableIfExists("refresh_tokens");
};
