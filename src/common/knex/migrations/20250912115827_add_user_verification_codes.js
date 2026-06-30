export async function up(knex) {
  await knex.schema.createTable("user_verification_codes", (t) => {
    t.increments("id").primary();
    t.integer("user_id").references("id").inTable("users").onDelete("CASCADE");
    t.string("mobile", 20).notNullable();
    t.string("code", 10).notNullable();
    t.timestamp("expires_at").notNullable();
    t.boolean("used").defaultTo(false);
    t.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("user_verification_codes");
}
