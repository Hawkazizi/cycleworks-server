export function up(knex) {
  return knex.schema.alterTable("buyer_requests", (table) => {
    table.timestamp("completed_at", { useTz: true }).nullable();
  });
}

export function down(knex) {
  return knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("completed_at");
  });
}
