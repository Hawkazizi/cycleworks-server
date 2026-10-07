/** Make users.mobile nullable — email-only signup is an advertised flow
 * ("Mobile or email is required") but the NOT NULL column rejected it.
 * All server code paths guard mobile access, login works via email.
 */
export function up(knex) {
  return knex.schema.alterTable("users", (table) => {
    table.string("mobile").nullable().alter();
  });
}

export function down(knex) {
  return knex.schema.alterTable("users", (table) => {
    table.string("mobile").notNullable().alter();
  });
}
