export async function up(knex) {
  await knex.schema.createTable("buyers", (table) => {
    table.increments("id").primary();
    table.string("name", 100).notNullable();
    table.string("email", 150).unique();
    table.text("password_hash").notNullable();
    table.string("mobile", 20).unique();
    table.string("status", 20).defaultTo("pending"); // pending, active, banned
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("buyers");
}
