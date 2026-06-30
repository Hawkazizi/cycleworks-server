/**
 * Add Forwarded_To_Customs to export_documents.status constraint
 */
export async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE export_documents
    DROP CONSTRAINT IF EXISTS export_documents_status_check;

    ALTER TABLE export_documents
    ADD CONSTRAINT export_documents_status_check
    CHECK (
      status IN (
        'Submitted',
        'Sent_To_Sales',
        'Import_Permit_Received',
        'Forwarded_To_Customs'
      )
    );
  `);
}

export async function down(knex) {
  // rollback: restore the constraint without Forwarded_To_Customs
  await knex.schema.raw(`
    ALTER TABLE export_documents
    DROP CONSTRAINT IF EXISTS export_documents_status_check;

    ALTER TABLE export_documents
    ADD CONSTRAINT export_documents_status_check
    CHECK (
      status IN (
        'Submitted',
        'Sent_To_Sales',
        'Import_Permit_Received'
      )
    );
  `);
}
