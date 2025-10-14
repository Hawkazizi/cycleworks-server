export async function up(knex) {
  await knex.schema.table("buyer_requests", (table) => {
    table.text("description").nullable();
  });
}

export async function down(knex) {
  await knex.schema.table("buyer_requests", (table) => {
    table.dropColumn("description");
  });
}
