export const up = async (knex) => {
  /* -------------------------------------------------------
   * 1️⃣ Add country_code column
   * ------------------------------------------------------- */
  await knex.schema.alterTable("admin_license_keys", (table) => {
    table.string("country_code", 2).nullable().index();
  });

  /* -------------------------------------------------------
   * 2️⃣ Backfill NON-QC roles → IR
   * ------------------------------------------------------- */
  await knex.raw(`
    UPDATE admin_license_keys AS alk
    SET country_code = 'IR'
    FROM roles AS r
    WHERE alk.role_id = r.id
      AND alk.country_code IS NULL
      AND r.name NOT IN ('qc_internal', 'qc_external');
  `);

  /* -------------------------------------------------------
   * 3️⃣ Trigger function enforcing country rules
   * ------------------------------------------------------- */
  await knex.raw(`
    CREATE OR REPLACE FUNCTION enforce_license_country_rules()
    RETURNS TRIGGER AS $$
    DECLARE
      role_name TEXT;
    BEGIN
      SELECT name INTO role_name
      FROM roles
      WHERE id = NEW.role_id;

      IF role_name IN ('qc_internal', 'qc_external') THEN
        IF NEW.country_code NOT IN ('OM', 'QA', 'BA') THEN
          RAISE EXCEPTION
            'QC roles can only have country_code OM, QA, or BA';
        END IF;
      ELSE
        IF NEW.country_code IS DISTINCT FROM 'IR' THEN
          RAISE EXCEPTION
            'Non-QC roles must have country_code IR';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  /* -------------------------------------------------------
   * 4️⃣ Attach trigger to admin_license_keys
   * ------------------------------------------------------- */
  await knex.raw(`
    CREATE TRIGGER admin_license_keys_country_trigger
    BEFORE INSERT OR UPDATE ON admin_license_keys
    FOR EACH ROW
    EXECUTE FUNCTION enforce_license_country_rules();
  `);
};

export const down = async (knex) => {
  await knex.raw(`
    DROP TRIGGER IF EXISTS admin_license_keys_country_trigger
    ON admin_license_keys;
  `);

  await knex.raw(`
    DROP FUNCTION IF EXISTS enforce_license_country_rules;
  `);

  await knex.schema.alterTable("admin_license_keys", (table) => {
    table.dropColumn("country_code");
  });
};
