/**
 * Fix foreign key constraint for admin_metadata_reviewed_by
 * It was incorrectly pointing to admin_license_keys instead of users
 */
export async function up(knex) {
  // 1. Check if the incorrect constraint exists before trying to drop it
  const constraintExists = await knex.raw(`
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE table_name = 'farmer_plan_containers' 
    AND constraint_name = 'farmer_plan_containers_admin_metadata_reviewed_by_foreign'
  `);

  if (constraintExists.rows.length > 0) {
    await knex.raw(`
      ALTER TABLE farmer_plan_containers 
      DROP CONSTRAINT farmer_plan_containers_admin_metadata_reviewed_by_foreign
    `);
  }

  // 2. Safety check: Nullify any existing data that doesn't match a valid user ID
  // This prevents the migration from failing if there is "dirty" data in the column
  await knex.raw(`
    UPDATE farmer_plan_containers 
    SET admin_metadata_reviewed_by = NULL 
    WHERE admin_metadata_reviewed_by IS NOT NULL 
    AND admin_metadata_reviewed_by NOT IN (SELECT id FROM users)
  `);

  // 3. Add the correct foreign key constraint pointing to the users table
  await knex.raw(`
    ALTER TABLE farmer_plan_containers 
    ADD CONSTRAINT farmer_plan_containers_admin_metadata_reviewed_by_foreign 
    FOREIGN KEY (admin_metadata_reviewed_by) REFERENCES users(id)
  `);
}

export async function down(knex) {
  // Revert the changes if we ever need to roll back
  await knex.raw(`
    ALTER TABLE farmer_plan_containers 
    DROP CONSTRAINT IF EXISTS farmer_plan_containers_admin_metadata_reviewed_by_foreign
  `);

  await knex.raw(`
    ALTER TABLE farmer_plan_containers 
    ADD CONSTRAINT farmer_plan_containers_admin_metadata_reviewed_by_foreign 
    FOREIGN KEY (admin_metadata_reviewed_by) REFERENCES admin_license_keys(id)
  `);
}
