// migration
export async function up(knex) {
  await knex.schema.alterTable("qc_pre_productions", (table) => {
    table.dropColumn("export_permit_request_id"); // remove old column
  });
}

export async function down(knex) {
  await knex.schema.alterTable("qc_pre_productions", (table) => {
    table
      .integer("export_permit_request_id")
      .unsigned()
      .references("id")
      .inTable("export_permit_requests");
  });
}
