export const up = async (knex) => {
  // 1) Replace the trigger function with KW added
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
        IF NEW.country_code NOT IN ('OM', 'QA', 'BA', 'KW') THEN
          RAISE EXCEPTION
            'QC roles can only have country_code OM, QA, BA, or KW';
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

  // 2) (Optional but safe) Ensure trigger exists and points to this function
  // If trigger already exists, this does nothing harmful.
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'admin_license_keys_country_trigger'
      ) THEN
        CREATE TRIGGER admin_license_keys_country_trigger
        BEFORE INSERT OR UPDATE ON admin_license_keys
        FOR EACH ROW
        EXECUTE FUNCTION enforce_license_country_rules();
      END IF;
    END;
    $$;
  `);
};

export const down = async (knex) => {
  // revert to old behavior (no KW)
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
};
