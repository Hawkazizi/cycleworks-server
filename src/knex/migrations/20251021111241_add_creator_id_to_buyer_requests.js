export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table
      .integer("creator_id")
      .references("id")
      .inTable("users")
      .onDelete("SET NULL")
      .index();
  });
}

export async function down(knex) {
  // Rollback
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("creator_id");
  });
}
