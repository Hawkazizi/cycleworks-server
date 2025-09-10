import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "../db/knex.js";

// Register new user + application
export const registerUser = async ({ name, email, password, reason }) => {
  // Check if email exists
  const existing = await db("users").where({ email }).first();
  if (existing) throw new Error("Email already registered");

  // Hash password
  const password_hash = await bcrypt.hash(password, 10);

  // Insert user
  const [user] = await db("users")
    .insert({ name, email, password_hash, status: "pending" })
    .returning("*");

  // Insert application
  const [application] = await db("user_applications")
    .insert({ user_id: user.id, reason, status: "pending" })
    .returning("*");

  return { user, application, message: "user requested awaiting for approval" };
};
// Login user
export const loginUser = async ({ email, password }) => {
  const user = await db("users").where({ email }).first();
  if (!user) throw new Error("Invalid credentials");

  if (user.status !== "active") {
    throw new Error("Account is not active yet");
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw new Error("Invalid credentials");

  // Generate JWT
  const token = jwt.sign(
    { id: user.id, email: user.email, role: "user" },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "1d" }
  );

  return { user, token };
};

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

// Get all export permit requests for a user
export const getMyPermitRequests = async (userId) => {
  return db("export_permit_requests")
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("packing_units.user_id", userId)
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
    .orderBy("export_permit_requests.created_at", "desc");
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
  { packing_unit_id, destination_country, max_tonnage }
) => {
  if (!packing_unit_id || !destination_country || !max_tonnage) {
    throw new Error(
      "packing_unit_id, destination_country, and max_tonnage are required"
    );
  }

  // Verify the packing unit belongs to this user and is approved
  const packingUnit = await db("packing_units")
    .where({ id: packing_unit_id, user_id: userId, status: "Approved" })
    .first();
  if (!packingUnit) {
    throw new Error("Packing unit not found or not approved");
  }

  // Create permit request
  const [permit] = await db("export_permit_requests")
    .insert({
      packing_unit_id,
      destination_country,
      max_tonnage,
      status: "Requested",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return permit;
};

// Register a new packing unit
export const registerPackingUnit = async (
  userId,
  { name, address, document_1, document_2 }
) => {
  if (!name) throw new Error("Packing unit name is required");

  const [unit] = await db("packing_units")
    .insert({
      name,
      user_id: userId,
      address: address || null,
      status: "Submitted",
      document_1: document_1 || null,
      document_2: document_2 || null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    })
    .returning("*");

  return unit;
};

// Get all packing units owned by this user
export const getMyPackingUnits = async (userId) => {
  return db("packing_units")
    .where({ user_id: userId })
    .select(
      "id",
      "name",
      "address",
      "status",
      "rejection_reason",
      "created_at",
      "updated_at"
    );
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
  return db("qc_pre_productions")
    .join(
      "export_permit_requests",
      "qc_pre_productions.export_permit_request_id",
      "export_permit_requests.id"
    )
    .join(
      "packing_units",
      "export_permit_requests.packing_unit_id",
      "packing_units.id"
    )
    .where("packing_units.user_id", userId)
    .select(
      "qc_pre_productions.id",
      "qc_pre_productions.status",
      "qc_pre_productions.submitted_at",
      "qc_pre_productions.rejection_reason",
      "qc_pre_productions.carton_label",
      "qc_pre_productions.egg_image",
      "export_permit_requests.id as permit_id",
      "packing_units.name as unit_name"
    )
    .orderBy("qc_pre_productions.submitted_at", "desc");
};

export const submitQcPreProduction = async (
  userId,
  { export_permit_request_id, carton_label, egg_image }
) => {
  if (!export_permit_request_id || !carton_label || !egg_image) {
    throw new Error(
      "Missing required fields: export_permit_request_id, carton_label, egg_image"
    );
  }

  // Ensure permit exists, is active, and belongs to this user
  const permit = await db("export_permit_requests")
    .where({ id: export_permit_request_id, status: "Timeline_Active" })
    .first();
  if (!permit) throw new Error("Active permit not found");

  const packingUnit = await db("packing_units")
    .where({ id: permit.packing_unit_id, user_id: userId })
    .first();
  if (!packingUnit)
    throw new Error("Unauthorized: user does not own this packing unit");

  const [qc] = await db("qc_pre_productions")
    .insert({
      export_permit_request_id,
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
      "Missing required fields: export_permit_request_id, packing_list, invoice, veterinary_certificate"
    );
  }
  // Ensure permit exists and belongs to this user (it may still be Timeline_Active)
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
