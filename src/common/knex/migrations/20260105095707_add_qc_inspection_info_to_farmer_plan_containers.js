export async function up(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    // JSONB field to store QC inspection data captured during qc_in_progress
    table
      .jsonb("qc_inspection_info")
      .notNullable()
      .defaultTo(knex.raw(`'{}'::jsonb`));
  });
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropColumn("qc_inspection_info");
  });
}
