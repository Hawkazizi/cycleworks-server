export async function up(knex) {
  // Normalize import_country values (optional but helpful)
  await knex.raw(`
    UPDATE buyer_requests
    SET import_country =
      CASE LOWER(TRIM(import_country))
        WHEN 'oman' THEN 'Oman'
        WHEN 'qatar' THEN 'Qatar'
        WHEN 'bahrain' THEN 'Bahrain'
        WHEN 'kuwait' THEN 'Kuwait'
        ELSE import_country
      END
    WHERE import_country IS NOT NULL;
  `);

  // Allowed countries
  await knex.raw(`
    ALTER TABLE buyer_requests
    ADD CONSTRAINT buyer_requests_import_country_allowed_chk
    CHECK (import_country IN ('Oman', 'Qatar', 'Bahrain', 'Kuwait'));
  `);

  // Kuwait borders constraint
  await knex.raw(`
    ALTER TABLE buyer_requests
    ADD CONSTRAINT buyer_requests_kuwait_borders_chk
    CHECK (
      import_country <> 'Kuwait'
      OR (
        entry_border = 'KHORRAMSHAHAR'
        AND exit_border = 'SHUWAIKH'
      )
    );
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE buyer_requests
    DROP CONSTRAINT IF EXISTS buyer_requests_kuwait_borders_chk;
  `);

  await knex.raw(`
    ALTER TABLE buyer_requests
    DROP CONSTRAINT IF EXISTS buyer_requests_import_country_allowed_chk;
  `);
}
