export async function up(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.date("deadline_start_date").nullable();
    table.date("deadline_end_date").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("deadline_start_date");
    table.dropColumn("deadline_end_date");
  });
}
