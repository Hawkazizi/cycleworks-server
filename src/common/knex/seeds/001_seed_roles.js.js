// seeds/01_roles.js
// ⚠️ DEV/TEST ONLY — never run `knex seed:run` against a production database.
// Canonical role names (must match src/common/constants/roles.js):
//   super_admin / admin / manager / user (supplier) / buyer / qc_internal / qc_external
export async function seed(knex) {
  // TRUNCATE ... CASCADE wipes roles AND every table referencing them
  // (user_roles, admin_license_keys, farmer_plans, external_qc_reports, ...)
  // so the seed set is safe to re-run in any order.
  await knex.raw("TRUNCATE TABLE roles RESTART IDENTITY CASCADE");

  await knex("roles").insert([
    { id: 1, name: "qc_internal" }, // کنترل کیفیت داخلی
    { id: 2, name: "qc_external" }, // کنترل کیفیت خارجی
    { id: 3, name: "admin" }, // کارشناس
    { id: 4, name: "manager" }, // مدیر
    { id: 5, name: "user" }, // تامین‌کننده (supplier)
    { id: 6, name: "buyer" }, // مشتری (customer)
  ]);

  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('roles','id'), GREATEST((SELECT MAX(id) FROM roles), 1))",
  );
}
