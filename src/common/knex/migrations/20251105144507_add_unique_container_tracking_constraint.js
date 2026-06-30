/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export async function up(knex) {
  const constraintName = "unique_container_tracking";

  // Check if the constraint already exists
  const exists = await knex.raw(
    `
    SELECT 1
    FROM pg_constraint
    WHERE conname = ?
    `,
    [constraintName],
  );

  if (exists.rows.length === 0) {
    console.log(`✅ Adding constraint: ${constraintName}`);

    await knex.schema.alterTable("container_tracking_statuses", (table) => {
      table.unique(["container_id", "tracking_code"], constraintName);
    });
  } else {
    console.log(`ℹ️ Constraint '${constraintName}' already exists, skipping.`);
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

export async function down(knex) {
  const constraintName = "unique_container_tracking";

  await knex.schema.alterTable("container_tracking_statuses", (table) => {
    table.dropUnique(["container_id", "tracking_code"], constraintName);
  });

  console.log(`🗑 Removed constraint: ${constraintName}`);
}
