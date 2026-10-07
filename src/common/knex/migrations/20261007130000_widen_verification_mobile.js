/** user_verification_codes.mobile stores mobile OR email (see registerUser:
 * `mobile: mobile || email`). varchar(20) truncated/rejected email identifiers.
 * Widen to 255 so emailed OTP codes are stored and verifiable.
 */
export function up(knex) {
  return knex.schema.alterTable("user_verification_codes", (table) => {
    table.string("mobile", 255).alter();
  });
}

export function down(knex) {
  return knex.schema.alterTable("user_verification_codes", (table) => {
    table.string("mobile", 20).alter();
  });
}
