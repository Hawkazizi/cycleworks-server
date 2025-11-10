/**
 * Add unique constraints for farmer_plans and farmer_plan_containers
 * to prevent duplicate plans and container numbers.
 */

export async function up(knex) {
  // ✅ Ensure farmer_plans.request_id is unique
  const hasPlanConstraint = await knex.raw(`
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_request_per_plan'
  `);

  if (hasPlanConstraint.rows.length === 0) {
    console.log("🔐 Adding unique_request_per_plan constraint...");
    await knex.schema.alterTable("farmer_plans", (table) => {
      table.unique(["request_id"], "unique_request_per_plan");
    });
  } else {
    console.log("✅ unique_request_per_plan already exists");
  }

  // ✅ Ensure farmer_plan_containers(plan_id, container_no) is unique
  const hasContainerConstraint = await knex.raw(`
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_container_per_plan'
  `);

  if (hasContainerConstraint.rows.length === 0) {
    console.log("🔐 Adding unique_container_per_plan constraint...");
    await knex.schema.alterTable("farmer_plan_containers", (table) => {
      table.unique(["plan_id", "container_no"], "unique_container_per_plan");
    });
  } else {
    console.log("✅ unique_container_per_plan already exists");
  }
}

export async function down(knex) {
  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    table.dropUnique(["plan_id", "container_no"], "unique_container_per_plan");
  });

  await knex.schema.alterTable("farmer_plans", (table) => {
    table.dropUnique(["request_id"], "unique_request_per_plan");
  });
}
