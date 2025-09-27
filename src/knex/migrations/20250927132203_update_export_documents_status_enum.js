export async function up(knex) {
  // Drop old check constraint
  await knex.schema.raw(`
    ALTER TABLE export_documents DROP CONSTRAINT IF EXISTS export_documents_status_check
  `);

  // Add new constraint
  await knex.schema.raw(`
    ALTER TABLE export_documents
    ADD CONSTRAINT export_documents_status_check
    CHECK (status IN ('Submitted', 'Approved', 'Rejected'))
  `);
}

export async function down(knex) {
  // Rollback to old constraint if needed
  await knex.schema.raw(`
    ALTER TABLE export_documents DROP CONSTRAINT IF EXISTS export_documents_status_check
  `);

  await knex.schema.raw(`
    ALTER TABLE export_documents
    ADD CONSTRAINT export_documents_status_check
    CHECK (status IN ('Submitted','Sent_To_Sales','Import_Permit_Received','Forwarded_To_Customs'))
  `);
}
