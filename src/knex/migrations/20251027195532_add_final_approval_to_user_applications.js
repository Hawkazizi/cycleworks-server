export async function up(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    // Second-phase admin approval
    table.boolean("final_approved").defaultTo(false);

    // Optional: when admin finally approves, they can leave a note
    table.text("final_admin_comment").nullable();
  });

  console.log(
    "✅ Added 'final_approved' and 'final_admin_comment' to user_applications",
  );
}

export async function down(knex) {
  await knex.schema.alterTable("user_applications", (table) => {
    table.dropColumn("final_approved");
    table.dropColumn("final_admin_comment");
  });

  console.log(
    "🗑️ Removed 'final_approved' and 'final_admin_comment' from user_applications",
  );
}
