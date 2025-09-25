import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db/knex.js";
import { sendVerificationCode } from "./SMS/smsService.js";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";

const SALT_ROUNDS = 10;

// Register new user + application
export const registerUser = async ({
  name,
  mobile,
  password,
  reason,
  role,
}) => {
  const existing = await db("users").where({ mobile }).first();
  if (existing) throw new Error("این شماره موبایل قبلاً ثبت شده است");

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db("users")
    .insert({ name, mobile, password_hash, status: "pending" })
    .returning("*");

  let application = null;
  if (reason) {
    [application] = await db("user_applications")
      .insert({ user_id: user.id, reason, status: "pending" })
      .returning("*");
  }

  const roleRow = await db("roles").where({ name: role }).first();
  if (!roleRow) throw new Error("نقش انتخاب شده معتبر نیست");

  await db("user_roles")
    .insert({ user_id: user.id, role_id: roleRow.id })
    .onConflict(["user_id", "role_id"])
    .ignore();

  return { user, application, message: "درخواست ثبت شد، منتظر تأیید مدیر" };
};

// Farmer login with mobile/password
export const loginUser = async ({ mobile, password }) => {
  const user = await db("users").where({ mobile }).first();
  if (!user) throw new Error("کاربری با این شماره یافت نشد");
  if (user.status !== "active")
    throw new Error("حساب کاربری هنوز فعال نشده است");

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw new Error("شماره موبایل یا رمز عبور نادرست است");

  const roles = await db("user_roles")
    .join("roles", "roles.id", "user_roles.role_id")
    .where("user_roles.user_id", user.id)
    .select("roles.name");

  const roleNames = roles.map((r) => r.name.toLowerCase());

  // ❌ Prevent buyers from logging in here
  if (roleNames.includes("buyer")) {
    throw new Error(
      "Buyers must login with a license key, not mobile/password"
    );
  }

  const payload = { id: user.id, mobile: user.mobile, roles: roleNames };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
    user: { id: user.id, mobile: user.mobile },
    roles: roleNames,
  };
};

// Create and send SMS verification code
export async function createCode(mobile, userId) {
  const code = Math.floor(10000 + Math.random() * 90000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db("user_verification_codes").insert({
    user_id: userId,
    mobile,
    code,
    expires_at: expiresAt,
  });

  await sendVerificationCode(mobile, code);
  return { code, expiresAt }; // only return in dev/testing
}

// Verify SMS code
export async function verifyUserCode(mobile, inputCode) {
  const record = await db("user_verification_codes")
    .where({ mobile, used: false })
    .andWhere("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
    .first();

  if (!record) throw new Error("کدی برای این شماره پیدا نشد یا منقضی شده است.");
  if (record.code !== inputCode) throw new Error("کد وارد شده نامعتبر است.");

  await db("user_verification_codes")
    .where({ id: record.id })
    .update({ used: true });

  return record;
}

// Get user profile by ID
export const getUserProfile = async (userId) => {
  const user = await db("users")
    .select("id", "name", "email", "status", "created_at")
    .where({ id: userId })
    .first();

  if (!user) {
    throw new Error("User not found");
  }

  // Optionally join packing units
  const packingUnits = await db("packing_units")
    .where({ user_id: userId })
    .select("id", "name", "status", "created_at");

  return { ...user, packingUnits };
};

// Register a new packing unit

export const registerPackingUnit = async (userId, { name, address }) => {
  if (!name) throw new Error("Packing unit name is required");

  const [unit] = await db("packing_units")
    .insert({
      name,
      user_id: userId,
      address: address || null,
      status: "Submitted",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return unit;
};

export const getMyPackingUnits = async (userId) => {
  const rows = await db("packing_units")
    .where({ user_id: userId })
    .select(
      "id",
      "name",
      "address",
      "status",
      "rejection_reason",
      "documents",
      "created_at",
      "updated_at"
    );

  return rows.map((row) => ({
    ...row,
    documents: row.documents || [],
  }));
};

// Get all export permit requests for a user
export const getMyPermitRequests = async (userId) => {
  return db("export_permit_requests as epr")
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .where("pu.user_id", userId)
    .leftJoin("buyer_requests as br", "epr.buyer_request_id", "br.id") // ✅ join buyer request
    .leftJoin("users as bu", "br.buyer_id", "bu.id") // ✅ join buyer info
    .select(
      "epr.id",
      "epr.destination_country",
      "epr.max_tonnage",
      "epr.status",
      "epr.permit_document",
      "epr.rejection_reason",
      "epr.issued_at",
      "epr.timeline_start",
      "epr.timeline_end",
      "epr.created_at",
      "epr.updated_at",
      "pu.id as packing_unit_id",
      "pu.name as packing_unit_name",
      // ✅ buyer info
      "br.id as buyer_request_id",
      "br.quantity as buyer_quantity",
      "br.import_country as buyer_country",
      "bu.name as buyer_name"
    )
    .orderBy("epr.created_at", "desc");
};

// Get a single export permit request by ID (must belong to user)
export const getMyPermitRequestById = async (userId, id) => {
  const permit = await db("export_permit_requests")
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("export_permit_requests.id", id)
    .andWhere("packing_units.user_id", userId)
    .select(
      "export_permit_requests.id",
      "export_permit_requests.destination_country",
      "export_permit_requests.max_tonnage",
      "export_permit_requests.status",
      "export_permit_requests.permit_document",
      "export_permit_requests.rejection_reason",
      "export_permit_requests.issued_at",
      "export_permit_requests.timeline_start",
      "export_permit_requests.timeline_end",
      "export_permit_requests.created_at",
      "export_permit_requests.updated_at",
      "packing_units.id as packing_unit_id",
      "packing_units.name as packing_unit_name"
    )
    .first();

  if (!permit) throw new Error("Permit not found or not owned by this user");
  return permit;
};

// Request a new export permit
export const requestExportPermit = async (
  userId,
  { packing_unit_id, destination_country, max_tonnage, buyer_request_id }
) => {
  if (!packing_unit_id || !destination_country || !max_tonnage) {
    throw new Error(
      "packing_unit_id, destination_country, and max_tonnage are required"
    );
  }

  // Check packing unit
  const packingUnit = await db("packing_units")
    .where({ id: packing_unit_id, user_id: userId, status: "Approved" })
    .first();
  if (!packingUnit) {
    throw new Error("Packing unit not found or not approved");
  }

  // ✅ Optional buyer link
  if (buyer_request_id) {
    const buyerReq = await db("buyer_requests")
      .where({ id: buyer_request_id, status: "accepted" })
      .first();
    if (!buyerReq) {
      throw new Error("Buyer request not found or not accepted");
    }
  }

  const [permit] = await db("export_permit_requests")
    .insert({
      packing_unit_id,
      destination_country,
      max_tonnage,
      buyer_request_id: buyer_request_id || null,
      status: "Requested",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return permit;
};

// ===================== WEEKLY LOADING PLANS =====================
export const getMyWeeklyPlans = async (userId) => {
  return db("weekly_loading_plans")
    .join(
      "export_permit_requests",
      "weekly_loading_plans.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("packing_units.user_id", userId)
    .select(
      "weekly_loading_plans.id",
      "weekly_loading_plans.week_start_date",
      "weekly_loading_plans.status",
      "weekly_loading_plans.submitted_at",
      "weekly_loading_plans.rejection_reason",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name"
    )
    .orderBy("weekly_loading_plans.submitted_at", "desc");
};

export const getMyWeeklyPlanById = async (userId, id) => {
  const plan = await db("weekly_loading_plans")
    .join(
      "export_permit_requests",
      "weekly_loading_plans.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("weekly_loading_plans.id", id)
    .andWhere("packing_units.user_id", userId)
    .select(
      "weekly_loading_plans.id",
      "weekly_loading_plans.week_start_date",
      "weekly_loading_plans.status",
      "weekly_loading_plans.submitted_at",
      "weekly_loading_plans.rejection_reason",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name"
    )
    .first();

  if (!plan) throw new Error("Weekly plan not found or not owned by this user");

  const details = await db("loading_plan_details")
    .where({ weekly_loading_plan_id: id })
    .select("id", "loading_date", "containers", "amount_tonnage", "notes");

  return { ...plan, details };
};

export const submitWeeklyLoadingPlan = async (
  userId,
  { export_permit_request_id, week_start_date, details }
) => {
  // Validate inputs
  if (
    !export_permit_request_id ||
    !week_start_date ||
    !Array.isArray(details) ||
    details.length === 0
  ) {
    throw new Error(
      "Missing required fields: export_permit_request_id, week_start_date, and details array"
    );
  }

  // Check submission day
  const submissionDay = await db("settings")
    .where({ key: "submission_day" })
    .first();
  if (!submissionDay) {
    throw new Error("Submission day not configured");
  }
  const today = new Date();
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  if (daysOfWeek[today.getDay()] !== submissionDay.value) {
    throw new Error(`Plans can only be submitted on ${submissionDay.value}`);
  }

  // Validate week_start_date is a Monday (or matches submission_day)
  const weekStart = new Date(week_start_date);
  if (daysOfWeek[weekStart.getDay()] !== submissionDay.value) {
    throw new Error(`week_start_date must be a ${submissionDay.value}`);
  }

  // Check permit exists and is active
  const permit = await db("export_permit_requests")
    .where({ id: export_permit_request_id, status: "Timeline_Active" })
    .first();
  if (!permit) {
    throw new Error("Active permit not found");
  }

  // Verify user owns the packing unit
  const packingUnit = await db("packing_units")
    .where({ id: permit.packing_unit_id, user_id: userId })
    .first();
  if (!packingUnit) {
    throw new Error(
      "Unauthorized: User does not own this permit’s packing unit"
    );
  }

  // Validate details: positive containers/tonnage, valid dates
  for (const detail of details) {
    if (!detail.loading_date || !detail.containers || !detail.amount_tonnage) {
      throw new Error(
        "Each detail must have loading_date, containers, and amount_tonnage"
      );
    }
    if (detail.containers < 0 || detail.amount_tonnage <= 0) {
      throw new Error(
        "Containers must be non-negative and tonnage must be positive"
      );
    }
    const loadingDate = new Date(detail.loading_date);
    if (
      loadingDate < weekStart ||
      loadingDate > new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
    ) {
      throw new Error(
        "loading_date must be within the week of week_start_date"
      );
    }
  }

  // Check permit-specific tonnage
  const totalPlanTonnage = details.reduce(
    (sum, d) => sum + parseFloat(d.amount_tonnage),
    0
  );
  if (totalPlanTonnage > permit.max_tonnage) {
    throw new Error(
      `Total plan tonnage (${totalPlanTonnage.toFixed(
        2
      )}) exceeds permit limit (${permit.max_tonnage.toFixed(2)})`
    );
  }

  // Check global weekly tonnage limit
  const weeklyLimitSetting = await db("settings")
    .where({ key: "weekly_tonnage_limit" })
    .first();
  const weeklyLimit = parseFloat(weeklyLimitSetting?.value || "1000.0");
  const totalTonnageThisWeek = await db("loading_plan_details")
    .join(
      "weekly_loading_plans",
      "loading_plan_details.weekly_loading_plan_id",
      "weekly_loading_plans.id"
    )
    .where("weekly_loading_plans.week_start_date", week_start_date)
    .where("weekly_loading_plans.status", "Approved")
    .sum("loading_plan_details.amount_tonnage as total")
    .first();

  const totalProposedTonnage =
    parseFloat(totalTonnageThisWeek.total || 0) + totalPlanTonnage;
  if (totalProposedTonnage > weeklyLimit) {
    throw new Error(
      `Total tonnage (${totalProposedTonnage.toFixed(
        2
      )}) exceeds global weekly limit (${weeklyLimit.toFixed(2)})`
    );
  }

  // Insert plan and details in transaction
  return db.transaction(async (trx) => {
    const [plan] = await trx("weekly_loading_plans")
      .insert({
        export_permit_request_id,
        week_start_date,
        status: "Submitted",
        submitted_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
      .returning("*");

    const detailInserts = details.map((d) => ({
      weekly_loading_plan_id: plan.id,
      loading_date: d.loading_date,
      containers: d.containers,
      amount_tonnage: d.amount_tonnage,
      notes: d.notes || null,
    }));

    const insertedDetails = await trx("loading_plan_details")
      .insert(detailInserts)
      .returning("*");

    return { plan, details: insertedDetails };
  });
};

// ===================== QC PRE-PRODUCTIONS =====================
export const getMyQcSubmissions = async (userId) => {
  return db("qc_pre_productions as qc")
    .join("weekly_loading_plans as wlp", "qc.weekly_loading_plan_id", "wlp.id")
    .join(
      "export_permit_requests as epr",
      "wlp.export_permit_request_id",
      "epr.id"
    )
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .where("pu.user_id", userId)
    .select(
      "qc.id",
      "qc.status",
      "qc.submitted_at",
      "qc.rejection_reason",
      "qc.carton_label",
      "qc.egg_image",
      "wlp.id as weekly_plan_id",
      "wlp.week_start_date",
      "pu.name as unit_name"
    )
    .orderBy("qc.submitted_at", "desc");
};
export const submitQcPreProduction = async (
  userId,
  { weekly_loading_plan_id, carton_label, egg_image }
) => {
  if (!weekly_loading_plan_id || !carton_label || !egg_image) {
    throw new Error(
      "Missing required fields: weekly_loading_plan_id, carton_label, egg_image"
    );
  }

  // Ensure weekly plan exists, is approved, and belongs to this user
  const plan = await db("weekly_loading_plans as wlp")
    .join(
      "export_permit_requests as epr",
      "wlp.export_permit_request_id",
      "epr.id"
    )
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .where("wlp.id", weekly_loading_plan_id)
    .andWhere("wlp.status", "Approved")
    .andWhere("pu.user_id", userId)
    .select("wlp.id")
    .first();

  if (!plan)
    throw new Error("Approved weekly plan not found or not owned by this user");

  const [qc] = await db("qc_pre_productions")
    .insert({
      weekly_loading_plan_id,
      carton_label,
      egg_image,
      status: "Submitted",
      submitted_at: db.fn.now(),
    })
    .returning("*");

  return qc;
};

// ===================== EXPORT DOCUMENTS =====================
export const getMyExportDocs = async (userId) => {
  return db("export_documents")
    .join(
      "export_permit_requests",
      "export_documents.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("packing_units.user_id", userId)
    .select(
      "export_documents.id",
      "export_documents.status",
      "export_documents.submitted_at",
      "export_documents.sent_to_sales_at",
      "export_documents.forwarded_to_customs_at",
      "export_documents.import_permit_document",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name"
    )
    .orderBy("export_documents.submitted_at", "desc");
};

export const submitExportDocuments = async (
  userId,
  { export_permit_request_id, packing_list, invoice, veterinary_certificate }
) => {
  if (
    !export_permit_request_id ||
    !packing_list ||
    !invoice ||
    !veterinary_certificate
  ) {
    throw new Error(
      "All fields are required: export_permit_request_id, packing_list, invoice, veterinary_certificate"
    );
  }

  const permit = await db("export_permit_requests")
    .where({ id: export_permit_request_id })
    .first();
  if (!permit) throw new Error("Permit not found");

  const unit = await db("packing_units")
    .where({ id: permit.packing_unit_id, user_id: userId })
    .first();
  if (!unit) throw new Error("Unauthorized: user does not own this permit");

  const [doc] = await db("export_documents")
    .insert({
      export_permit_request_id,
      packing_list,
      invoice,
      veterinary_certificate,
      status: "Submitted",
      submitted_at: db.fn.now(),
    })
    .returning("*");

  return doc;
};

// ===================== FINAL DOCUMENTS =====================
export const getMyFinalDocs = async (userId) => {
  return db("final_documents")
    .join(
      "export_permit_requests",
      "final_documents.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("packing_units.user_id", userId)
    .select(
      "final_documents.id",
      "final_documents.status",
      "final_documents.submitted_at",
      "final_documents.rejection_reason",
      "final_documents.reviewed_at",
      "final_documents.closed_at",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name"
    )
    .orderBy("final_documents.submitted_at", "desc");
};
export const submitFinalDocuments = async (
  userId,
  {
    export_permit_request_id,
    certificate,
    packing_list,
    invoice,
    customs_declaration,
    shipping_license,
    certificate_of_origin,
    chamber_certificate,
  }
) => {
  const required = [
    export_permit_request_id,
    certificate,
    packing_list,
    invoice,
    customs_declaration,
    shipping_license,
    certificate_of_origin,
    chamber_certificate,
  ];
  if (required.some((v) => !v)) {
    throw new Error(
      "Missing required fields for final documents (see schema)."
    );
  }

  const permit = await db("export_permit_requests")
    .where({ id: export_permit_request_id })
    .first();
  if (!permit) throw new Error("Permit not found");

  const unit = await db("packing_units")
    .where({ id: permit.packing_unit_id, user_id: userId })
    .first();
  if (!unit) throw new Error("Unauthorized: user does not own this permit");

  const [finalDoc] = await db("final_documents")
    .insert({
      export_permit_request_id,
      certificate,
      packing_list,
      invoice,
      customs_declaration,
      shipping_license,
      certificate_of_origin,
      chamber_certificate,
      status: "Submitted",
      submitted_at: db.fn.now(),
    })
    .returning("*");

  return finalDoc;
};

const mapStatus = (record, okStatuses = ["Approved", "Timeline_Active"]) => {
  if (!record) return "NotStarted";
  if (record.status === "Rejected") return "Rejected";
  if (okStatuses.includes(record.status)) return "Approved";
  if (["Submitted", "Requested"].includes(record.status)) return "Submitted";
  return record.status || "Submitted";
};

export const getPermitProgress = async (userId, permitId) => {
  // Verify ownership
  const permit = await db("export_permit_requests as epr")
    .join("packing_units as pu", "epr.packing_unit_id", "pu.id")
    .where("epr.id", permitId)
    .andWhere("pu.user_id", userId)
    .select(
      "epr.id",
      "epr.status",
      "pu.name as unit_name",
      "pu.status as unit_status",
      "epr.destination_country",
      "epr.max_tonnage"
    )
    .first();

  if (!permit) throw new Error("Permit not found or not owned by this user");

  // Fetch related stages
  const exportDoc = await db("export_documents")
    .where({ export_permit_request_id: permitId })
    .orderBy("submitted_at", "desc")
    .first();

  const weeklyPlan = await db("weekly_loading_plans")
    .where({ export_permit_request_id: permitId })
    .orderBy("submitted_at", "desc")
    .first();

  let qc = null;
  if (weeklyPlan) {
    qc = await db("qc_pre_productions")
      .where({ weekly_loading_plan_id: weeklyPlan.id })
      .orderBy("submitted_at", "desc")
      .first();
  }

  const finalDoc = await db("final_documents")
    .where({ export_permit_request_id: permitId })
    .orderBy("submitted_at", "desc")
    .first();

  // Map to roadmap stages
  const stages = [
    {
      key: "packing_unit",
      label: "واحد بسته‌بندی",
      status: mapStatus({ status: permit.unit_status }),
    },
    {
      key: "permit",
      label: "درخواست مجوز",
      status: mapStatus({ status: permit.status }),
    },
    {
      key: "export_docs",
      label: "اسناد صادرات",
      status: mapStatus(exportDoc),
      data: exportDoc,
    },
    {
      key: "weekly_plan",
      label: "برنامه هفتگی",
      status: mapStatus(weeklyPlan),
      data: weeklyPlan,
    },
    { key: "qc", label: "کنترل کیفی", status: mapStatus(qc), data: qc },
    {
      key: "final_docs",
      label: "اسناد نهایی",
      status: mapStatus(finalDoc),
      data: finalDoc,
    },
  ];

  // Current index = first non-approved/rejected stage
  let currentIndex = 0;
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i].status;
    if (st === "Approved") {
      currentIndex = i + 1;
      continue;
    }
    if (["Rejected", "Submitted", "Timeline_Active"].includes(st)) {
      currentIndex = i;
      break;
    }
  }
  if (currentIndex >= stages.length) currentIndex = stages.length - 1;

  return {
    permit,
    stages,
    current_index: currentIndex,
  };
};
