/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1. NUCLEAR OPTION: Drop ALL custom (non-internal) triggers on admin_license_keys
  // This guarantees the old 'IR' enforcing trigger is destroyed, no matter its name.
  await knex.raw(`
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN (
            SELECT tgname FROM pg_trigger 
            WHERE tgrelid = 'public.admin_license_keys'::regclass 
            AND NOT tgisinternal
        ) LOOP
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.admin_license_keys', r.tgname);
        END LOOP;
    END $$;
  `);

  // 2. Clean up any orphaned functions from previous attempts
  await knex.raw(`DROP FUNCTION IF EXISTS check_turkey_license_country();`);
  await knex.raw(`DROP FUNCTION IF EXISTS validate_license_country();`);
  await knex.raw(`DROP FUNCTION IF EXISTS enforce_country_code();`);
  await knex.raw(`DROP FUNCTION IF EXISTS check_license_country();`);

  // 3. Create the NEW, correct trigger function for Turkey
  await knex.raw(`
    CREATE OR REPLACE FUNCTION check_turkey_license_country()
    RETURNS TRIGGER AS $$
    DECLARE
      v_role_name VARCHAR;
    BEGIN
      SELECT name INTO v_role_name FROM public.roles WHERE id = NEW.role_id;
      
      IF v_role_name IN ('qc_internal', 'qc_external') THEN
        IF NEW.country_code NOT IN ('OM', 'QA', 'BA', 'KW') THEN
          RAISE EXCEPTION 'QC roles must have country_code OM, QA, BA, or KW';
        END IF;
      ELSE
        IF NEW.country_code != 'TR' THEN
          RAISE EXCEPTION 'Non-QC roles in Turkey database must have country_code TR';
        END IF;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 4. Attach the new trigger
  await knex.raw(`
    CREATE TRIGGER enforce_turkey_license_country
    BEFORE INSERT OR UPDATE ON public.admin_license_keys
    FOR EACH ROW
    EXECUTE FUNCTION check_turkey_license_country();
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.raw(
    `DROP TRIGGER IF EXISTS enforce_turkey_license_country ON public.admin_license_keys;`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS check_turkey_license_country();`);
}
