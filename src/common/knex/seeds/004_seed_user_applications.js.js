// seeds/04_user_applications.js
// ⚠️ DEV/TEST ONLY — never run `knex seed:run` against a production database.
// Matches the enriched user_applications schema (biosecurity/vaccination/emergency/
// food_safety/description/farm_biosecurity jsonb + supplier_name + final review fields).
export async function seed(knex) {
  await knex("user_applications").del();

  const admin = await knex("users").where({ email: "admin@example.com" }).first();
  const manager = await knex("users")
    .where({ email: "manager@example.com" })
    .first();
  const supplier = await knex("users")
    .where({ email: "supplier@example.com" })
    .first();
  const pendingSupplier = await knex("users")
    .where({ email: "supplier.pending@example.com" })
    .first();

  await knex("user_applications").insert([
    {
      user_id: pendingSupplier.id,
      reason: "درخواست همکاری به عنوان تامین‌کننده تخم‌مرغ",
      status: "pending",
      supplier_name: "مرغداری آریا",
      biosecurity: JSON.stringify({ answer: "بله" }),
      vaccination: JSON.stringify({ answer: "کامل" }),
      emergency: JSON.stringify({ answer: "دارای طرح اضطراری" }),
      food_safety: JSON.stringify({ answer: "گواهی ایزو 22000" }),
      farm_biosecurity: JSON.stringify({ answer: "رعایت می‌شود" }),
      description: JSON.stringify({ text: "تولید ماهانه ۵۰ هزار شانه" }),
      all_documents: JSON.stringify([]),
      created_at: knex.fn.now(),
    },
    {
      user_id: supplier.id,
      reason: "به‌روزرسانی مدارک تامین‌کننده",
      status: "approved",
      supplier_name: "مرغداری شاهین",
      reviewed_by: admin.id,
      reviewed_at: knex.fn.now(),
      final_approved: true,
      final_reviewed_by: manager.id,
      final_reviewed_at: knex.fn.now(),
      final_admin_comment: "مدارک کامل است",
      admin_comment: "تایید اولیه",
      created_at: knex.fn.now(),
    },
  ]);

  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('user_applications','id'), GREATEST((SELECT MAX(id) FROM user_applications), 1))",
  );
}