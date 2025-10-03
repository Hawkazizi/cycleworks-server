// seeds/03_license_keys.js
export async function seed(knex) {
  await knex("admin_license_keys").del();

  const roles = await knex("roles").select("id", "name");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const users = await knex("users").select("id", "email");
  const userMap = Object.fromEntries(users.map((u) => [u.email, u.id]));

  const rows = [
    {
      key: "ADMIN-KEY-123",
      role_id: roleMap["admin"],
      assigned_to: userMap["admin@example.com"],
      is_active: true,
    },
    {
      key: "MANAGER-KEY-456",
      role_id: roleMap["manager"],
      assigned_to: userMap["manager@example.com"],
      is_active: true,
    },
    {
      key: "BUYER-KEY-789",
      role_id: roleMap["buyer"],
      assigned_to: userMap["buyer@example.com"],
      is_active: true,
    },
    // Farmers use the "user" role, but they don’t need license keys
  ];

  await knex("admin_license_keys").insert(rows);

  await knex.raw(`
    SELECT setval(
      pg_get_serial_sequence('admin_license_keys','id'),
      (SELECT MAX(id) FROM admin_license_keys)
    )
  `);
}
