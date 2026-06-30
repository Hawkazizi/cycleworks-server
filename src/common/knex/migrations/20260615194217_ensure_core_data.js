// src/knex/migrations/20260615120000_ensure_core_data.js

export async function up(knex) {
  // --- 1. Ensure Core Roles Exist ---
  const existingRoles = await knex("roles").pluck("name");
  const requiredRoles = ["admin", "manager", "user", "buyer"];

  const rolesToInsert = requiredRoles.filter(
    (role) => !existingRoles.includes(role),
  );

  if (rolesToInsert.length > 0) {
    await knex("roles").insert(rolesToInsert.map((name) => ({ name })));
    console.log(
      `✅ Inserted ${rolesToInsert.length} new roles: [${rolesToInsert.join(", ")}]`,
    );
  } else {
    console.log("ℹ️ All required roles already exist.");
  }

  // --- 2. Ensure Core Settings Exist ---
  const existingSettings = await knex("settings").pluck("key");
  const requiredSettings = [
    {
      key: "submission_day",
      value: "Monday",
      description: "Day of week for (legacy) weekly loading plan submission",
    },
    {
      key: "timeline_days",
      value: "7",
      description: "Days for (legacy) timeline after permit issuance",
    },
    {
      key: "weekly_tonnage_limit",
      value: "1000",
      description: "Global weekly tonnage cap (legacy compatibility)",
    },
  ];

  const settingsToInsert = requiredSettings.filter(
    (setting) => !existingSettings.includes(setting.key),
  );

  if (settingsToInsert.length > 0) {
    await knex("settings").insert(settingsToInsert);
    console.log(`✅ Inserted ${settingsToInsert.length} new settings.`);
  } else {
    console.log("ℹ️ All required settings already exist.");
  }
}

export async function down(knex) {
  // It's generally not safe or necessary to delete core data like roles and settings.
  // This migration is designed to be a one-way "ensure existence" operation.
  // Therefore, we leave the `down` function empty.
  console.log(
    "⚠️ Skipping rollback for core data migration. Data integrity is preserved.",
  );
}
