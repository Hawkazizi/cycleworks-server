export async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table
      .string("profile_picture", 255)
      .nullable()
      .comment("Path to user profile picture");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("profile_picture");
  });
}
