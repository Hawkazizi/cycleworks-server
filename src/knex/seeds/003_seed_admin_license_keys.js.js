export async function seed(knex) {
  // Clear previous keys
  await knex("admin_license_keys").del();

  // Fetch roles
  const adminRole = await knex("roles").where({ name: "admin" }).first();
  const managerRole = await knex("roles").where({ name: "manager" }).first();

  // Fetch users
  const adminUser = await knex("users")
    .where({ email: "admin@example.com" })
    .first();
  const managerUser = await knex("users")
    .where({ email: "manager@example.com" })
    .first();

  // Insert license keys and assign to users
  await knex("admin_license_keys").insert([
    {
      key: "ADMIN-KEY-123",
      role_id: adminRole.id,
      assigned_to: adminUser.id,
      is_active: true,
    },
    {
      key: "MANAGER-KEY-456",
      role_id: managerRole.id,
      assigned_to: managerUser.id,
      is_active: true,
    },
  ]);
}
