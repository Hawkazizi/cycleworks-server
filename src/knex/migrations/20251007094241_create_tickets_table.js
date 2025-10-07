export async function up(knex) {
  await knex.schema.createTable("tickets", (table) => {
    table.increments("id").primary();
    table
      .integer("user_id")
      .unsigned()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("role").notNullable().defaultTo("user");
    table.string("subject").nullable();
    table.text("message").notNullable();
    table.string("attachment_path").nullable();
    table.string("attachment_name").nullable();
    table.string("attachment_mimetype").nullable();
    table
      .enu("status", ["open", "closed", "answered"])
      .notNullable()
      .defaultTo("open");
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("tickets");
}
