// seeds/07_buyer_requests.js
// ⚠️ DEV/TEST ONLY — never run `knex seed:run` against a production database.
// Enriched fixture aligned with the container-based structure:
//   buyer_requests → farmer_plans → farmer_plan_containers
//   + buyer_request_suppliers, container_tracking_statuses, external_qc_reports
// Covers every dashboard/QC/report branch:
//   - pending / accepted / completed / rejected buyer_requests
//   - containers: in_progress, completed, rejected, pending supplier
//   - qc_status: pending / approved / held
//   - one approved Oman container WITH an external QC report (hidden from external QC list)
//   - one approved Oman container WITHOUT a report (visible to external QC OM license)
//   - tracking codes + container_tracking_statuses history
export async function seed(knex) {
  // wipe the whole request chain (CASCADE covers plans/containers/suppliers/tracking/reports)
  await knex.raw(`
    TRUNCATE TABLE
      buyer_request_suppliers,
      container_tracking_statuses,
      external_qc_reports,
      internal_qc_hold_resolutions,
      farmer_plan_files,
      farmer_plan_containers,
      farmer_plans,
      buyer_requests
    RESTART IDENTITY CASCADE
  `);
  await knex("notifications").del();
  await knex("ticket_replies").del();
  await knex("ticket_recipients").del();
  await knex("tickets").del();

  const users = await knex("users").select("id", "email");
  const userMap = Object.fromEntries(users.map((u) => [u.email, u.id]));
  const buyer = userMap["buyer@example.com"];
  const supplier = userMap["supplier@example.com"];
  const adminUser = userMap["admin@example.com"];

  const licenses = await knex("admin_license_keys").select("id", "key");
  const adminLicense = licenses.find((l) => l.key === "ADMIN-KEY-IR-001");
  const qcInternalLicense = licenses.find((l) => l.key === "QC-INT-KEY-QA-001");
  const qcExternalLicense = licenses.find((l) => l.key === "QC-EXT-KEY-OM-001");

  const now = knex.fn.now();
  const future = (days) =>
    knex.raw(`(now() + interval '${days} days')::date`);

  const baseRequest = {
    buyer_id: buyer,
    creator_id: buyer,
    reviewed_by: adminLicense.id,
    reviewed_at: now,
    product_type: "eggs",
    packaging: "carton",
    size: ["mixed"],
    egg_type: "standard",
    certificates: ["ISO22000"],
    preferred_supplier_name: "شاهین (Supplier)",
    preferred_supplier_id: supplier,
    transport_type: "truck",
    expiration_days: 30,
    admin_extra_files: JSON.stringify([]),
  };

  const requests = (await knex("buyer_requests")
    .returning("id")
    .insert([
      // r1: pending — Qatar
      { ...baseRequest, status: "pending", import_country: "Qatar",
        entry_border: "Bushehr Port", exit_border: "Doha",
        container_amount: 3, cartons: 1200, order_number: "ORD-1001",
        expiration_date: future(45), deadline_start: future(10), deadline_end: future(30),
        description: "درخواست در انتظار بررسی — قطر" },
      // r2: accepted — Qatar (main QC-internal dataset)
      { ...baseRequest, status: "accepted", import_country: "Qatar",
        entry_border: "Bushehr Port", exit_border: "Doha",
        container_amount: 4, cartons: 4800, order_number: "ORD-1002",
        expiration_date: future(60), deadline_start: future(5), deadline_end: future(25),
        allocation_status: "allocated", allocated_containers: 4,
        description: "سفارش فعال قطر — ۴ کانتینر" },
      // r3: accepted — Oman (external QC dataset)
      { ...baseRequest, status: "accepted", import_country: "Oman",
        entry_border: "Bandar Abbas", exit_border: "Sohar",
        container_amount: 2, cartons: 2400, order_number: "ORD-1003",
        expiration_date: future(60), deadline_start: future(5), deadline_end: future(30),
        allocation_status: "allocated", allocated_containers: 2,
        description: "سفارش فعال عمان — ۲ کانتینر" },
      // r4: accepted — Bahrain (simple, one container pending QC)
      { ...baseRequest, status: "accepted", import_country: "Bahrain",
        entry_border: "Bushehr Port", exit_border: "Manama",
        container_amount: 1, cartons: 1200, order_number: "ORD-1004",
        expiration_date: future(45), deadline_start: future(7), deadline_end: future(21),
        allocation_status: "allocated", allocated_containers: 1,
        description: "سفارش فعال بحرین — ۱ کانتینر" },
      // r5: completed — Oman
      { ...baseRequest, status: "completed", import_country: "Oman",
        entry_border: "Bandar Abbas", exit_border: "Sohar",
        container_amount: 1, cartons: 1200, order_number: "ORD-1004",
        expiration_date: future(40), deadline_start: future(-10), deadline_end: future(-2),
        allocation_status: "completed", allocated_containers: 1,
        description: "سفارش تکمیل‌شده عمان" },
      // r6: rejected — Qatar
      { ...baseRequest, status: "rejected", import_country: "Qatar",
        entry_border: "Bushehr Port", exit_border: "Doha",
        container_amount: 2, cartons: 800, order_number: "ORD-1005",
        expiration_date: future(30), deadline_start: future(5), deadline_end: future(15),
        description: "درخواست رد شده" },
      // r7: pending — Kuwait (fixed border pair per DB constraint)
      { ...baseRequest, status: "pending", import_country: "Kuwait",
        entry_border: "KHORRAMSHAHAR", exit_border: "SHUWAIKH",
        container_amount: 2, cartons: 1600, order_number: "ORD-1005",
        expiration_date: future(50), deadline_start: future(10), deadline_end: future(25),
        description: "درخواست در انتظار بررسی — کویت" },
    ])).map((row) => row.id);
  const [r1, r2, r3, r4, r5] = requests;

  // ------------------------------------------------------------------ plans
  const planDate = knex.raw("now()::date");
  const plans = (await knex("farmer_plans")
    .returning("id")
    .insert([
      { request_id: r2, status: "approved", reviewed_by: adminLicense.id,
        reviewed_at: now, plan_date: planDate },
      { request_id: r3, status: "approved", reviewed_by: adminLicense.id,
        reviewed_at: now, plan_date: planDate },
      { request_id: r4, status: "approved", reviewed_by: adminLicense.id,
        reviewed_at: now, plan_date: planDate },
      { request_id: r5, status: "approved", reviewed_by: adminLicense.id,
        reviewed_at: now, plan_date: planDate },
    ])).map((row) => row.id);
  const [p2, p3, p4, p5] = plans;

  // ------------------------------------------------------------- containers
  const containerRows = [
    // --- Qatar request (QC internal, license QA) ---
    { plan_id: p2, container_no: 1, buyer_request_id: r2, supplier_id: supplier,
      status: "submitted", farmer_status: "pending", in_progress: true, is_completed: false,
      qc_status: "pending", tracking_code: "TRK-QA-1001",
      transport_info: JSON.stringify({ driver: "علی رضایی", plate: "12ب345-67" }),
      plan_date: planDate },
    { plan_id: p2, container_no: 2, buyer_request_id: r2, supplier_id: supplier,
      status: "completed", farmer_status: "completed", in_progress: false, is_completed: true,
      completed_at: now, qc_status: "approved", qc_reviewed_by: qcInternalLicense.id,
      qc_reviewed_at: now, qc_note: "تایید شد", tracking_code: "TRK-QA-1002",
      transport_info: JSON.stringify({ driver: "رضا محمدی", plate: "45د678-90" }),
      plan_date: planDate },
    { plan_id: p2, container_no: 3, buyer_request_id: r2, supplier_id: supplier,
      status: "submitted", farmer_status: "completed", in_progress: true, is_completed: false,
      qc_status: "held", qc_hold_reason: "temperature", qc_hold_details: "دمای حمل خارج از محدوده",
      tracking_code: "TRK-QA-1003", transport_info: JSON.stringify({}),
      plan_date: planDate },
    { plan_id: p2, container_no: 4, buyer_request_id: r2, supplier_id: supplier,
      status: "submitted", farmer_status: "pending", in_progress: false, is_completed: false,
      is_rejected: true, qc_status: "pending", tracking_code: "TRK-QA-1004",
      transport_info: JSON.stringify({}), plan_date: planDate },
    // --- Oman request (external QC, license OM) ---
    { plan_id: p3, container_no: 1, buyer_request_id: r3, supplier_id: supplier,
      status: "completed", farmer_status: "completed", in_progress: false, is_completed: true,
      completed_at: now, qc_status: "approved", qc_reviewed_by: qcInternalLicense.id,
      qc_reviewed_at: now, tracking_code: "TRK-OM-2001",
      transport_info: JSON.stringify({}), plan_date: planDate },
    { plan_id: p3, container_no: 2, buyer_request_id: r3, supplier_id: supplier,
      status: "completed", farmer_status: "completed", in_progress: false, is_completed: true,
      completed_at: now, qc_status: "approved", qc_reviewed_by: qcInternalLicense.id,
      qc_reviewed_at: now, tracking_code: "TRK-OM-2002",
      transport_info: JSON.stringify({}), plan_date: planDate },
    // --- Bahrain ---
    { plan_id: p4, container_no: 1, buyer_request_id: r4, supplier_id: supplier,
      status: "submitted", farmer_status: "pending", in_progress: true, is_completed: false,
      qc_status: "pending", tracking_code: "TRK-BA-3001",
      transport_info: JSON.stringify({}), plan_date: planDate },
    // --- completed Oman request ---
    { plan_id: p5, container_no: 1, buyer_request_id: r5, supplier_id: supplier,
      status: "completed", farmer_status: "completed", in_progress: false, is_completed: true,
      completed_at: now, qc_status: "approved", qc_reviewed_by: qcInternalLicense.id,
      qc_reviewed_at: now, tracking_code: "TRK-OM-4001",
      transport_info: JSON.stringify({}), plan_date: planDate },
  ];
  const containers = (await knex("farmer_plan_containers")
    .returning("id")
    .insert(containerRows)).map((row) => row.id);
  const [c1, c2, c3, c4, c5, c6, c7, c8] = containers;

  // ------------------------------------------------------ tracking history
  // DB constraint: UNIQUE (container_id, tracking_code) — only the first
  // history entry per container carries the tracking code.
  await knex("container_tracking_statuses").insert([
    { container_id: c1, status: "submitted", note: "ثبت اولیه", created_by: adminUser,
      tracking_code: "TRK-QA-1001" },
    { container_id: c2, status: "loaded", note: "بارگیری در مبدأ", created_by: adminUser,
      tracking_code: "TRK-QA-1002" },
    { container_id: c2, status: "in transit", note: "در مسیر بوشهر", created_by: adminUser },
    { container_id: c5, status: "arrived", note: "ورود به عمان", created_by: adminUser,
      tracking_code: "TRK-OM-2001" },
    { container_id: c8, status: "delivered", note: "تحویل نهایی", created_by: adminUser,
      tracking_code: "TRK-OM-4001" },
  ]);

  // ------------------------------------------------ supplier assignments
  await knex("buyer_request_suppliers").insert([
    { buyer_request_id: r2, supplier_id: supplier, share_percentage: 100,
      assigned_by: adminLicense.id, container_id: null },
    { buyer_request_id: r3, supplier_id: supplier, share_percentage: 100,
      assigned_by: adminLicense.id, container_id: null },
    { buyer_request_id: r4, supplier_id: supplier, share_percentage: 100,
      assigned_by: adminLicense.id, container_id: null },
    { buyer_request_id: r5, supplier_id: supplier, share_percentage: 100,
      assigned_by: adminLicense.id, container_id: null },
  ]);

  // --------------------------- external QC report for c6 (hidden from list)
  await knex("external_qc_reports").insert({
    container_id: c6,
    qc_license_id: qcExternalLicense.id,
    actual_quantity: 1200,
    quality_condition: "مناسب",
    packaging_condition: "بدون آسیب",
    discrepancies: null,
    attachments: JSON.stringify([]),
  });

  // ------------------------------------------------------------- tickets
  await knex("tickets").insert([
    { user_id: supplier, role: "user", subject: "مشکل در بارگذاری مدارک",
      message: "فایل گواهی سلامت آپلود نمی‌شود.", status: "open",
      created_by: supplier, last_message_at: now },
    { user_id: buyer, role: "buyer", subject: "سوال درباره سفارش ORD-1002",
      message: "زمان تخلیه کانتینر دوم چه زمانی است؟", status: "answered",
      created_by: buyer, assigned_to: adminUser, last_message_at: now },
  ]);

  // ------------------------------------------------------- notifications
  await knex("notifications").insert([
    { user_id: adminUser, type: "new_request", related_request_id: r1,
      message: "درخواست جدید ثبت شد", status: "unread" },
    { user_id: adminUser, type: "container_arrived", related_request_id: r2,
      message: "کانتینر TRK-QA-1001 به مقصد رسید", status: "unread" },
    { user_id: supplier, type: "plan_approved", related_request_id: r2,
      message: "طرح بارگیری شما تایید شد", status: "unread" },
  ]);

  // -------------------------------------------------------------- sequences
  const seq = (table) =>
    knex.raw(
      `SELECT setval(pg_get_serial_sequence('${table}','id'), GREATEST((SELECT MAX(id) FROM ${table}), 1))`,
    );
  for (const t of [
    "buyer_requests", "farmer_plans", "farmer_plan_containers",
    "container_tracking_statuses", "buyer_request_suppliers",
    "external_qc_reports", "tickets", "notifications",
  ]) {
    await seq(t);
  }
}