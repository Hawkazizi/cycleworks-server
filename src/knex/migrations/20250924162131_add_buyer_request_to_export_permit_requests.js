// migrations/20250924120000_add_buyer_request_to_export_permit_requests.js

export async function up(knex) {
  await knex.schema.alterTable("export_permit_requests", (table) => {
    table
      .integer("buyer_request_id")
      .unsigned()
      .references("id")
      .inTable("buyer_requests")
      .onDelete("SET NULL")
      .index();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("export_permit_requests", (table) => {
    table.dropForeign("buyer_request_id");
    table.dropColumn("buyer_request_id");
  });
}
