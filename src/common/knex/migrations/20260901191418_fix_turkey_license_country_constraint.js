/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1. Dynamically find and drop the OLD trigger and function that was enforcing 'IR'
  // This safely removes the old restriction without needing to know its exact name.
  await knex.raw(`
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN (
            SELECT t.tgname as trigger_name, p.proname as func_name
            FROM pg_trigger t
            JOIN pg_proc p ON t.tgfoid = p.oid
            WHERE t.tgrelid = 'public.admin_license_keys'::regclass
            AND (p.proname LIKE '%country%' OR p.proname LIKE '%license%')
        ) LOOP
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.admin_license_keys', r.trigger_name);
            EXECUTE format('DROP FUNCTION IF EXISTS %I()', r.func_name);
        END LOOP;
    END $$;
  `);

  // 2. Create the NEW, correct trigger function for the Turkey database
  await knex.raw(`
    CREATE OR REPLACE FUNCTION check_turkey_license_country()
    RETURNS TRIGGER AS $$
    DECLARE
      v_role_name VARCHAR;
    BEGIN
      -- Get the role name for the incoming role_id
      SELECT name INTO v_role_name FROM public.roles WHERE id = NEW.role_id;
      
      -- QC Roles must be assigned to export countries
      IF v_role_name IN ('qc_internal', 'qc_external') THEN
        IF NEW.country_code NOT IN ('OM', 'QA', 'BA', 'KW') THEN
          RAISE EXCEPTION 'QC roles must have country_code OM, QA, BA, or KW';
        END IF;
      ELSE
        -- Non-QC Roles (Admin, Supplier, etc.) in Turkey DB MUST be 'TR'
        IF NEW.country_code != 'TR' THEN
          RAISE EXCEPTION 'Non-QC roles in Turkey database must have country_code TR';
        END IF;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 3. Attach the new trigger to the admin_license_keys table
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
  // Revert: Drop the new Turkey trigger and function
  await knex.raw(
    `DROP TRIGGER IF EXISTS enforce_turkey_license_country ON public.admin_license_keys;`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS check_turkey_license_country();`);
}
