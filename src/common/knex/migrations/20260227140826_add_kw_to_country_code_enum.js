export async function up(knex) {
  // Drop old constraint (replace with your real name if needed)
  await knex.raw(`
    ALTER TABLE admin_license_keys
    DROP CONSTRAINT IF EXISTS admin_license_keys_country_code_check;
  `);

  // Recreate with KW added
  await knex.raw(`
    ALTER TABLE admin_license_keys
    ADD CONSTRAINT admin_license_keys_country_code_check
    CHECK (country_code IN ('IR','OM','QA','BA','KW'));
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE admin_license_keys
    DROP CONSTRAINT IF EXISTS admin_license_keys_country_code_check;
  `);

  await knex.raw(`
    ALTER TABLE admin_license_keys
    ADD CONSTRAINT admin_license_keys_country_code_check
    CHECK (country_code IN ('IR','OM','QA','BA'));
  `);
}
