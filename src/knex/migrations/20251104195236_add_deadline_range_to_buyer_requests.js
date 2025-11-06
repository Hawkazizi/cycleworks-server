export async function up(knex) {
  // 🧩 Add new start/end columns and drop old single field
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.date("deadline_start").nullable().comment("Start of delivery window");
    table.date("deadline_end").nullable().comment("End of delivery window");
    table.dropColumn("deadline_date");
  });
}

export async function down(knex) {
  // 🔁 Rollback: re-add deadline_date and drop the new range columns
  await knex.schema.alterTable("buyer_requests", (table) => {
    table.date("deadline_date").nullable().comment("Single deadline date");
    table.dropColumn("deadline_start");
    table.dropColumn("deadline_end");
  });
}
