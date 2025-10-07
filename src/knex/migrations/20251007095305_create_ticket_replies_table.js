export async function up(knex) {
  await knex.schema.createTable("ticket_replies", (table) => {
    table.increments("id").primary();
    table
      .integer("ticket_id")
      .unsigned()
      .references("id")
      .inTable("tickets")
      .onDelete("CASCADE");
    table
      .integer("admin_id")
      .unsigned()
      .references("id")
      .inTable("users") // assuming admins are also in users
      .onDelete("SET NULL");
    table.text("message").notNullable();
    table.string("attachment_path").nullable();
    table.string("attachment_name").nullable();
    table.string("attachment_mimetype").nullable();
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("ticket_replies");
}
