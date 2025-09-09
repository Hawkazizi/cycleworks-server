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
