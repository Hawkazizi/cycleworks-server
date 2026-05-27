import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/jwt.js";
import db from "../../db/knex.js";
import fs from "fs";
import path from "path";
import * as superAdminService from "../../services/superAdmin/superAdmin.service.js";

const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY;

/* =======================================================================
   🔐 AUTH
======================================================================= */
export const login = async (req, res) => {
  const { key } = req.body;

  if (!SUPER_ADMIN_KEY) {
    return res.status(500).json({ error: req.t("auth.key_not_configured") });
  }

  if (!key || key !== SUPER_ADMIN_KEY) {
    return res.status(401).json({ error: req.t("auth.invalid_key") });
  }

  const token = jwt.sign(
    {
      id: "superadmin",
      email: "superadmin@local",
      roles: ["super_admin"],
    },
    JWT_SECRET,
    { expiresIn: "2h" },
  );

  res.json({
    token,
    user: {
      id: "superadmin",
      email: "superadmin@local",
      roles: ["super_admin"],
    },
  });
};

export const me = (req, res) => {
  res.json({ user: req.user });
};

/* =======================================================================
   🧩 DASHBOARD (Super Admin)
======================================================================= */
export const getAdminDashboard = async (req, res) => {
  try {
    const data = await superAdminService.getAdminDashboard();
    res.set("Cache-Control", "private, max-age=20");
    return res.json(data);
  } catch (err) {
    console.error("superadmin getAdminDashboard error:", err);
    return res.status(500).json({ error: req.t("dashboard.load_failed") });
  }
};

export const getServerSpecs = async (req, res) => {
  try {
    const data = await superAdminService.getServerSpecs();
    res.set("Cache-Control", "private, max-age=10");
    return res.json(data);
  } catch (err) {
    console.error("superadmin getServerSpecs error:", err);
    return res.status(500).json({ error: req.t("dashboard.specs_failed") });
  }
};

/* =======================================================================
   🧩 ROLES & SETTINGS (Super Admin)
======================================================================= */
export const getRoles = async (req, res) => {
  try {
    const roles = await superAdminService.getRoles();
    res.json({ roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getSettings = async (req, res) => {
  try {
    const settings = await superAdminService.getAllSettings();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const updated = await superAdminService.updateSetting(key, value);
    res.json({ setting: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   👥 USER MANAGEMENT (Super Admin)
======================================================================= */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, role_id, mobile } = req.body;

    if (!name || !email || !password || !role_id || !mobile) {
      return res
        .status(400)
        .json({ error: req.t("validation.incomplete_user_info") });
    }

    const user = await superAdminService.createUserWithRole({
      name,
      email,
      password,
      role_id,
      mobile,
    });

    res.status(201).json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const listUsers = async (req, res) => {
  try {
    const users = await superAdminService.getAllUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const banOrUnbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const superAdminId = req.user.id;

    const updatedUser = await superAdminService.toggleUserStatus(
      Number(id),
      action,
      superAdminId,
    );

    res.json({ user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export async function getUserById(req, res) {
  try {
    const { id } = req.params;

    const user = await db("users as u")
      .leftJoin("user_applications as ua", "u.id", "ua.user_id")
      .select(
        "u.id",
        "u.name",
        "u.email",
        "u.mobile",
        "u.status",
        "u.created_at",
        "ua.supplier_name",
        "ua.status as application_status",
        "ua.reviewed_at",
        "ua.reviewed_by",
      )
      .where("u.id", id)
      .first();

    if (!user)
      return res.status(404).json({ error: req.t("common.not_found") });

    const buyerRequests = await db("buyer_requests as br")
      .leftJoin("users as b", "br.buyer_id", "b.id")
      .select(
        "br.id",
        "br.status",
        "br.created_at",
        "b.name as buyer_name",
        "b.email as buyer_email",
        "b.mobile as buyer_mobile",
      )
      .where("br.preferred_supplier_id", id)
      .orWhereIn(
        "br.id",
        db("buyer_request_suppliers")
          .select("buyer_request_id")
          .where("supplier_id", id),
      )
      .orderBy("br.created_at", "desc");

    const containers = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .leftJoin("buyer_requests as br", "p.request_id", "br.id")
      .select(
        "c.id",
        "c.container_no",
        "c.status",
        "c.created_at",
        "br.id as buyer_request_id",
      )
      .whereIn(
        "p.request_id",
        buyerRequests.map((r) => r.id),
      );

    const stats = {
      total_requests: buyerRequests.length,
      total_containers: containers.length,
      active_requests: buyerRequests.filter(
        (r) => r.status === "accepted" || r.status === "pending",
      ).length,
    };

    res.json({ user, stats, buyerRequests, containers });
  } catch (err) {
    console.error("superadmin getUserById error:", err);
    res.status(500).json({ error: err.message });
  }
}

export const getUserProfilePicture = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db("users")
      .select("profile_picture")
      .where({ id })
      .first();

    if (!user || !user.profile_picture) {
      return res.status(204).end();
    }

    const filePath = path.join(
      process.cwd(),
      user.profile_picture.startsWith("/")
        ? user.profile_picture.slice(1)
        : user.profile_picture,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: req.t("common.file_not_found") });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    res.setHeader("Content-Type", mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("superadmin getUserProfilePicture error:", err);
    res.status(500).json({ error: req.t("errors.fetch_picture") });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await superAdminService.deleteUser(Number(id));
    res.json({ success: true, message: req.t("user.deleted") });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   🔑 LICENSE KEYS (Super Admin)
======================================================================= */
export const getLicenseKeys = async (req, res) => {
  try {
    const keys = await superAdminService.getAllLicenseKeys();
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createLicenseKey = async (req, res) => {
  try {
    const { key, role_id, country_code, assigned_to, user } = req.body;
    const created = await superAdminService.createLicenseKey({
      key,
      role_id,
      country_code,
      assigned_to,
      user,
    });
    res.status(201).json({ key: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    const { key, role_id, country_code, assigned_to } = req.body;
    const updated = await superAdminService.updateLicenseKey({
      id,
      key,
      role_id,
      country_code,
      assigned_to,
    });
    res.json({ key: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const toggleLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await superAdminService.toggleLicenseKey(id);
    res.json({ key: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const deleteLicenseKey = async (req, res) => {
  try {
    const { id } = req.params;
    await superAdminService.deleteLicenseKey(id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   📋 APPLICATIONS (Super Admin)
======================================================================= */
export const getApplications = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      search = "",
      status,
      final_approved,
      user_status,
    } = req.query;

    const result = await superAdminService.getApplications({
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      status: status || null,
      final_approved:
        final_approved === "true"
          ? true
          : final_approved === "false"
            ? false
            : null,
      user_status: user_status || null,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getApplicationsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const apps = await superAdminService.getApplicationsByUser(userId);

    if (!apps || apps.length === 0) {
      return res.status(404).json({ message: req.t("application.not_found") });
    }

    res.json(apps);
  } catch (err) {
    console.error("superadmin getApplicationsByUser error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = "super_admin";
    const updates = { ...req.body };

    if (req.files && Object.keys(req.files).length > 0) {
      for (const field in req.files) {
        const file = req.files[field][0];
        updates[field] = JSON.stringify({
          originalname: file.originalname,
          filename: file.filename,
          path: `/uploads/temp/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size,
          uploaded_by: role,
          uploaded_at: new Date().toISOString(),
        });
      }
    }

    const result = await superAdminService.updateApplication(
      id,
      updates,
      userId,
      role,
    );

    res.json(result);
  } catch (err) {
    console.error("superadmin updateApplication error:", err);
    res.status(400).json({ error: err.message });
  }
};

export const reviewApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const reviewerId = req.user.id;

    const result = await superAdminService.reviewApplication(
      id,
      status,
      reviewerId,
      "super_admin",
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const finalizeApplicationReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { final_approved, final_admin_comment } = req.body;
    const userId = req.user.id;
    const role = "super_admin";

    const result = await superAdminService.updateApplication(
      id,
      { final_approved, final_admin_comment },
      userId,
      role,
    );

    res.json(result);
  } catch (err) {
    console.error("superadmin finalizeApplicationReview error:", err);
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   🧩 Helpers
======================================================================= */
const toInt = (v, d = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};
const toStr = (v, d = "") => (v == null ? d : String(v));

/* =======================================================================
   📋 Buyer Requests
======================================================================= */
export async function listBuyerRequests(req, res) {
  try {
    const out = await superAdminService.listBuyerRequests({
      page: toInt(req.query.page, 1),
      pageSize: toInt(req.query.pageSize, 20),
      search: toStr(req.query.search, ""),
      status: toStr(req.query.status, ""),
      import_country: toStr(req.query.import_country, ""),
      allocation_status: toStr(req.query.allocation_status, ""),
      sort: toStr(req.query.sort, "created_at"),
      dir: toStr(req.query.dir, "desc"),
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function createBuyerRequest(req, res) {
  try {
    const out = await superAdminService.createBuyerRequest(req.body);
    res.status(201).json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function getBuyerRequest(req, res) {
  try {
    const out = await superAdminService.getBuyerRequest(toInt(req.params.id), {
      includeContainers: req.query.includeContainers !== "false",
    });
    res.json(out);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
}

export async function updateBuyerRequest(req, res) {
  try {
    const out = await superAdminService.updateBuyerRequest(
      toInt(req.params.id),
      req.body,
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deleteBuyerRequest(req, res) {
  try {
    const out = await superAdminService.deleteBuyerRequest(
      toInt(req.params.id),
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* Buyer Request -> Containers */
export async function listBuyerRequestContainers(req, res) {
  try {
    const out = await superAdminService.listBuyerRequestContainers(
      toInt(req.params.id),
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function createContainerForRequest(req, res) {
  try {
    const out = await superAdminService.createContainerForRequest(
      toInt(req.params.id),
      req.body,
    );
    res.status(201).json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* =======================================================================
   📦 Containers
======================================================================= */
export async function listContainers(req, res) {
  try {
    const out = await superAdminService.listContainers({
      page: toInt(req.query.page, 1),
      pageSize: toInt(req.query.pageSize, 20),
      search: toStr(req.query.search, ""),
      status: toStr(req.query.status, ""),
      qc_status: toStr(req.query.qc_status, ""),
      supplier_id: req.query.supplier_id ? toInt(req.query.supplier_id) : null,
      buyer_request_id: req.query.buyer_request_id
        ? toInt(req.query.buyer_request_id)
        : null,
      plan_id: req.query.plan_id ? toInt(req.query.plan_id) : null,
      import_country: toStr(req.query.import_country, ""),
      sort: toStr(req.query.sort, "created_at"),
      dir: toStr(req.query.dir, "desc"),
    });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function getContainer(req, res) {
  try {
    const out = await superAdminService.getContainer(toInt(req.params.id));
    res.json(out);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
}

export async function updateContainer(req, res) {
  try {
    const out = await superAdminService.updateContainer(
      toInt(req.params.id),
      req.body,
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deleteContainer(req, res) {
  try {
    const out = await superAdminService.deleteContainer(toInt(req.params.id));
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function transferContainer(req, res) {
  try {
    const out = await superAdminService.transferContainer(
      toInt(req.params.id),
      {
        toBuyerRequestId: toInt(req.body.toBuyerRequestId),
        containerNo: req.body.containerNo ? toInt(req.body.containerNo) : null,
      },
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function changeContainerSupplier(req, res) {
  try {
    const out = await superAdminService.changeContainerSupplier(
      toInt(req.params.id),
      { supplierId: toInt(req.body.supplierId) },
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* =======================================================================
   🚚 Tracking statuses
======================================================================= */
export async function listContainerTrackingStatuses(req, res) {
  try {
    const out = await superAdminService.listContainerTrackingStatuses(
      toInt(req.params.id),
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function createContainerTrackingStatus(req, res) {
  try {
    const out = await superAdminService.createContainerTrackingStatus(
      toInt(req.params.id),
      req.body,
    );
    res.status(201).json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function updateContainerTrackingStatus(req, res) {
  try {
    const out = await superAdminService.updateContainerTrackingStatus(
      toInt(req.params.id),
      req.body,
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deleteContainerTrackingStatus(req, res) {
  try {
    const out = await superAdminService.deleteContainerTrackingStatus(
      toInt(req.params.id),
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* =======================================================================
   🧪 External QC report
======================================================================= */
export async function upsertExternalQcReport(req, res) {
  try {
    const out = await superAdminService.upsertExternalQcReport(
      toInt(req.params.id),
      req.body,
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deleteExternalQcReport(req, res) {
  try {
    const out = await superAdminService.deleteExternalQcReport(
      toInt(req.params.id),
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* =======================================================================
   🧯 Hold resolutions
======================================================================= */
export async function createHoldResolution(req, res) {
  try {
    const out = await superAdminService.createHoldResolution(
      toInt(req.params.id),
      req.body,
    );
    res.status(201).json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deleteHoldResolution(req, res) {
  try {
    const out = await superAdminService.deleteHoldResolution(
      toInt(req.params.id),
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* =======================================================================
   📎 Files
======================================================================= */
export async function updatePlanFile(req, res) {
  try {
    const out = await superAdminService.updatePlanFile(
      toInt(req.params.id),
      req.body,
    );
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deletePlanFile(req, res) {
  try {
    const out = await superAdminService.deletePlanFile(toInt(req.params.id));
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
