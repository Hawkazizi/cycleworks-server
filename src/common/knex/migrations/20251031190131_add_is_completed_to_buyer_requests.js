export function up(knex) {
  return knex.schema.alterTable("buyer_requests", (table) => {
    table.boolean("is_completed").notNullable().defaultTo(false);
  });
}

export function down(knex) {
  return knex.schema.alterTable("buyer_requests", (table) => {
    table.dropColumn("is_completed");
  });
}
