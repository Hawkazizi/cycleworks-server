export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn(
    "user_applications",
    "admin_comment",
  );
  if (!hasColumn) {
    await knex.schema.alterTable("user_applications", (table) => {
      table
        .text("admin_comment")
        .nullable()
        .comment("Admin review comment before final approval");
    });
  }
}

export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn(
    "user_applications",
    "admin_comment",
  );
  if (hasColumn) {
    await knex.schema.alterTable("user_applications", (table) => {
      table.dropColumn("admin_comment");
    });
  }
}
