// migrations/20260104_add_qc_fields_to_farmer_plan_containers.js

export const up = async (knex) => {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    // ---------------- QC core status ----------------
    table.string("qc_status", 30).notNullable().defaultTo("pending").index();

    // ---------------- QC review metadata ----------------
    table
      .integer("qc_reviewed_by")
      .nullable()
      .references("id")
      .inTable("admin_license_keys")
      .onDelete("SET NULL");

    table.timestamp("qc_reviewed_at").nullable();

    table.text("qc_note").nullable();

    // ---------------- QC hold info ----------------
    table.string("qc_hold_reason", 50).nullable();
    table.text("qc_hold_details").nullable();
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropColumn("qc_hold_details");
    table.dropColumn("qc_hold_reason");
    table.dropColumn("qc_note");
    table.dropColumn("qc_reviewed_at");
    table.dropColumn("qc_reviewed_by");
    table.dropColumn("qc_status");
  });
};
