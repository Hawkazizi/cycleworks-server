/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1. Drop the OLD, restrictive CHECK constraint that is currently blocking 'TR'
  await knex.raw(`
    ALTER TABLE public.admin_license_keys 
    DROP CONSTRAINT IF EXISTS admin_license_keys_country_code_check;
  `);

  // 2. Add a NEW, flexible CHECK constraint that allows ALL valid country codes
  await knex.raw(`
    ALTER TABLE public.admin_license_keys 
    ADD CONSTRAINT admin_license_keys_country_code_check 
    CHECK (country_code IN ('IR', 'TR', 'OM', 'QA', 'BA', 'KW'));
  `);

  // 3. Clean up any leftover triggers from previous attempts
  await knex.raw(`
    DO $$
    DECLARE r RECORD;
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
  await knex.raw(`DROP FUNCTION IF EXISTS check_turkey_license_country();`);
  await knex.raw(`DROP FUNCTION IF EXISTS check_license_country_by_role();`);

  // 4. Create a unified trigger that enforces role-specific rules safely
  await knex.raw(`
    CREATE OR REPLACE FUNCTION check_license_country_by_role()
    RETURNS TRIGGER AS $$
    DECLARE
      v_role_name VARCHAR;
    BEGIN
      SELECT name INTO v_role_name FROM public.roles WHERE id = NEW.role_id;
      
      -- QC Roles MUST be export countries
      IF v_role_name IN ('qc_internal', 'qc_external') THEN
        IF NEW.country_code NOT IN ('OM', 'QA', 'BA', 'KW') THEN
          RAISE EXCEPTION 'QC roles must have country_code OM, QA, BA, or KW';
        END IF;
      ELSE
        -- Non-QC Roles MUST be a local database country (IR or TR)
        -- (Your Node.js code ensures the correct one is sent based on the x-country header)
        IF NEW.country_code NOT IN ('IR', 'TR') THEN
          RAISE EXCEPTION 'Non-QC roles must have country_code IR or TR';
        END IF;
      END IF;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 5. Attach the new trigger
  await knex.raw(`
    CREATE TRIGGER enforce_license_country_by_role
    BEFORE INSERT OR UPDATE ON public.admin_license_keys
    FOR EACH ROW
    EXECUTE FUNCTION check_license_country_by_role();
  `);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.raw(
    `DROP TRIGGER IF EXISTS enforce_license_country_by_role ON public.admin_license_keys;`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS check_license_country_by_role();`);
  await knex.raw(`
    ALTER TABLE public.admin_license_keys 
    DROP CONSTRAINT IF EXISTS admin_license_keys_country_code_check;
  `);
}
