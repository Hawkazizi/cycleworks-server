export async function up(knex) {
  // check which columns exist first
  const hasFarmerStatus = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "farmer_status",
  );
  const hasFinalStatus = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "final_status",
  );
  const hasInProgress = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "in_progress",
  );
  const hasIsCompleted = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "is_completed",
  );

  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    // ✅ Add in_progress if not exists
    if (!hasInProgress) {
      table.boolean("in_progress").defaultTo(false);
    }

    // ✅ Drop final_status if exists
    if (hasFinalStatus) {
      table.dropColumn("final_status");
    }

    // ✅ Add farmer_status if missing (skip if exists)
    if (!hasFarmerStatus) {
      table.string("farmer_status").defaultTo("pending");
    }

    // ✅ Add is_completed if missing
    if (!hasIsCompleted) {
      table.boolean("is_completed").defaultTo(false);
    }
  });
}

export async function down(knex) {
  const hasFinalStatus = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "final_status",
  );
  const hasInProgress = await knex.schema.hasColumn(
    "farmer_plan_containers",
    "in_progress",
  );

  await knex.schema.alterTable("farmer_plan_containers", (table) => {
    // rollback cleanly
    if (hasInProgress) table.dropColumn("in_progress");
    if (!hasFinalStatus) table.string("final_status").defaultTo("pending");
  });
}
