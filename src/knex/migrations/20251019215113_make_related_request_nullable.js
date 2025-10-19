export async function up(knex) {
  await knex.schema.alterTable("notifications", (table) => {
    table.integer("related_request_id").nullable().alter();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("notifications", (table) => {
    table.integer("related_request_id").notNullable().alter();
  });
}
