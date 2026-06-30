// migrations/20250922_fix_sequences.js

export async function up(knex) {
  // Helper: reset sequence for a table + column
  const resetSeq = async (table, column = "id") => {
    await knex.raw(`
      SELECT setval(
        pg_get_serial_sequence('${table}', '${column}'),
        COALESCE((SELECT MAX(${column}) + 1 FROM ${table}), 1),
        false
      );
    `);
  };

  // List of all tables with SERIAL ids
  const tables = [
    "users",
    "roles",
    "user_applications",
    // "user_roles", // ⚠️ no SERIAL column, composite PK → skip
    "admin_license_keys",
    "packing_units",
    "export_permit_requests",
    "weekly_loading_plans",
    "loading_plan_details",
    "qc_pre_productions",
    "export_documents",
    "final_documents",
    "buyer_requests",
    "buyer_request_offers",
    "user_verification_codes",
  ];

  for (const t of tables) {
    try {
      await resetSeq(t);
      console.log(`✅ Sequence fixed for ${t}`);
    } catch (e) {
      console.warn(`⚠️ Skipping ${t}: ${e.message}`);
    }
  }
}

export async function down(knex) {
  // No-op rollback (sequence fix is safe to leave in place)
}
