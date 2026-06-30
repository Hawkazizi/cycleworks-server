export async function up(knex) {
  const hasApproved = await knex.schema.hasColumn(
    "user_applications",
    "final_approved",
  );
  const hasComment = await knex.schema.hasColumn(
    "user_applications",
    "final_admin_comment",
  );
  const hasReviewer = await knex.schema.hasColumn(
    "user_applications",
    "final_reviewed_by",
  );
  const hasReviewedAt = await knex.schema.hasColumn(
    "user_applications",
    "final_reviewed_at",
  );

  await knex.schema.alterTable("user_applications", (table) => {
    // Only add if not existing
    if (!hasApproved) table.boolean("final_approved").defaultTo(false);
    if (!hasComment) table.text("final_admin_comment").nullable();

    if (!hasReviewer) {
      table
        .integer("final_reviewed_by")
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
    }

    if (!hasReviewedAt) table.timestamp("final_reviewed_at").nullable();
  });

  console.log("✅ Ensured all final review fields exist in user_applications");
}

export async function down(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.dropColumn("final_reviewed_by");
    table.dropColumn("final_reviewed_at");
    // Don't drop final_approved or final_admin_comment since they already existed before
  });

  console.log(
    "🗑️ Removed final reviewer tracking columns from user_applications",
  );
}
