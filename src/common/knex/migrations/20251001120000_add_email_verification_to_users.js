// migrations/20251001120000_add_email_verification_to_users.js
export async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.boolean("email_verified").defaultTo(false);
    table.string("email_verification_code", 10).nullable();
    table.timestamp("email_verification_expires").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("email_verified");
    table.dropColumn("email_verification_code");
    table.dropColumn("email_verification_expires");
  });
}
