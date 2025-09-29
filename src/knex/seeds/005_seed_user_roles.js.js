// seeds/05_user_roles.js
export async function seed(knex) {
  await knex("user_roles").del();

  const adminRole = await knex("roles").where({ name: "admin" }).first();
  const managerRole = await knex("roles").where({ name: "manager" }).first();
  const userRole = await knex("roles").where({ name: "user" }).first();
  const buyerRole = await knex("roles").where({ name: "buyer" }).first();

  const admin = await knex("users")
    .where({ email: "admin@example.com" })
    .first();
  const manager = await knex("users")
    .where({ email: "manager@example.com" })
    .first();
  const user = await knex("users").where({ email: "user@example.com" }).first();
  const buyer = await knex("users")
    .where({ email: "buyer@example.com" })
    .first();
  const farmer = await knex("users")
    .where({ email: "farmer@example.com" })
    .first();

  await knex("user_roles").insert([
    { user_id: admin.id, role_id: adminRole.id },
    { user_id: manager.id, role_id: managerRole.id },
    { user_id: user.id, role_id: userRole.id },
    { user_id: buyer.id, role_id: buyerRole.id },
    { user_id: farmer.id, role_id: userRole.id }, // farmer is a "user" role
  ]);
}
