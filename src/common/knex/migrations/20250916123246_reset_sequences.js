export async function up(knex) {
  // Reset sequences to MAX(id)+1 for all main tables
  await knex.raw(`
    SELECT setval(pg_get_serial_sequence('users', 'id'),
                  COALESCE((SELECT MAX(id) FROM users), 0) + 1, false);
                  
    SELECT setval(pg_get_serial_sequence('packing_units', 'id'),
                  COALESCE((SELECT MAX(id) FROM packing_units), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('export_permit_requests', 'id'),
                  COALESCE((SELECT MAX(id) FROM export_permit_requests), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('weekly_loading_plans', 'id'),
                  COALESCE((SELECT MAX(id) FROM weekly_loading_plans), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('loading_plan_details', 'id'),
                  COALESCE((SELECT MAX(id) FROM loading_plan_details), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('qc_pre_productions', 'id'),
                  COALESCE((SELECT MAX(id) FROM qc_pre_productions), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('export_documents', 'id'),
                  COALESCE((SELECT MAX(id) FROM export_documents), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('final_documents', 'id'),
                  COALESCE((SELECT MAX(id) FROM final_documents), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('user_applications', 'id'),
                  COALESCE((SELECT MAX(id) FROM user_applications), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('roles', 'id'),
                  COALESCE((SELECT MAX(id) FROM roles), 0) + 1, false);

    SELECT setval(pg_get_serial_sequence('admin_license_keys', 'id'),
                  COALESCE((SELECT MAX(id) FROM admin_license_keys), 0) + 1, false);
  `);
}

export async function down(knex) {
  // No-op: we don’t want to roll back sequence resets
}
