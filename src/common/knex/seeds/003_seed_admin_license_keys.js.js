// seeds/03_license_keys.js
// ⚠️ DEV/TEST ONLY — never run `knex seed:run` against a production database.
// DB trigger `check_license_country_by_role` enforces:
//   - qc_internal / qc_external keys MUST have country_code OM, QA, BA or KW
//   - every other role MUST have country_code IR or TR
export async function seed(knex) {
  await knex("admin_license_keys").del();

  const roles = await knex("roles").select("id", "name");
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const users = await knex("users").select("id", "email");
  const userMap = Object.fromEntries(users.map((u) => [u.email, u.id]));

  await knex("admin_license_keys").insert([
    {
      key: "ADMIN-KEY-IR-001",
      role_id: roleMap["admin"],
      assigned_to: userMap["admin@example.com"],
      country_code: "IR",
      is_active: true,
    },
    {
      key: "MANAGER-KEY-IR-001",
      role_id: roleMap["manager"],
      assigned_to: userMap["manager@example.com"],
      country_code: "IR",
      is_active: true,
    },
    {
      key: "BUYER-KEY-IR-001",
      role_id: roleMap["buyer"],
      assigned_to: userMap["buyer@example.com"],
      country_code: "IR",
      is_active: true,
    },
    {
      key: "QC-INT-KEY-QA-001",
      role_id: roleMap["qc_internal"],
      assigned_to: userMap["qc.internal@example.com"],
      country_code: "QA", // Qatar
      is_active: true,
    },
    {
      key: "QC-EXT-KEY-OM-001",
      role_id: roleMap["qc_external"],
      assigned_to: userMap["qc.external@example.com"],
      country_code: "OM", // Oman
      is_active: true,
    },
  ]);

  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('admin_license_keys','id'), GREATEST((SELECT MAX(id) FROM admin_license_keys), 1))",
  );
}