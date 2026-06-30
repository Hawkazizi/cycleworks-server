import fs from "fs";
import path from "path";
import db from "../../common/db/knex.js";
import { sendMail } from "../../common/config/mailer.js";
import * as userService from "./user.service.js";
import * as farmerPlansService from "../farmerPlan/farmerPlans.service.js";

/* =======================================================================
   🔐 AUTHENTICATION
======================================================================= */

/** 📝 Register new farmer (user) + upload application files */
export const register = async (req, res) => {
  try {
    const { name, mobile, password, reason, supplier_name, role } = req.body;

    if (!mobile || !password) {
      return res
        .status(400)
        .json({ error: req.t("validation.mobile_password_required") });
    }

    const chosenRole = role || "user";

    // Create user and application record
    const { user, application } = await userService.registerUser({
      name,
      mobile,
      password,
      reason,
      supplier_name,
      role: chosenRole,
    });

    // Prepare user folder
    const userDir = path.join(
      "uploads",
      "users",
      String(user.id),
      "registration",
    );
    fs.mkdirSync(userDir, { recursive: true });

    // Helper: move files
    const saveFile = (file) => {
      if (!file) return null;
      const newPath = path.join(userDir, file.originalname);
      fs.renameSync(file.path, newPath);
      return {
        filename: file.originalname,
        path: "/" + newPath.replace(/\\/g, "/"),
        mimetype: file.mimetype,
      };
    };

    // Collect uploaded files
    const fileInfos = {
      biosecurity: saveFile(req.files?.biosecurity?.[0]),
      vaccination: saveFile(req.files?.vaccination?.[0]),
      emergency: saveFile(req.files?.emergency?.[0]),
      food_safety: saveFile(req.files?.foodSafety?.[0]),
      description: saveFile(req.files?.description?.[0]),
      farm_biosecurity: saveFile(req.files?.farmBiosecurity?.[0]),
    };

    // Update application with file info
    await db("user_applications")
      .where({ id: application.id })
      .update(fileInfos);

    res.status(201).json({
      user,
      application: { ...application, ...fileInfos },
      message: req.t("user.registration_pending"),
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/** 🔑 Farmer login */
export const login = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password)
      return res
        .status(400)
        .json({ error: req.t("validation.mobile_password_required") });

    const result = await userService.loginUser({ mobile, password });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

/** 👀 Get farmer profile */
export const getProfile = async (req, res) => {
  try {
    const profile = await userService.getUserProfile(req.user.id);
    res.json({ profile });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

/** ✏️ Update farmer profile */
export async function updateProfile(req, res) {
  try {
    const updated = await userService.updateProfileById(req.user.id, req.body);
    res.json({ profile: updated });
  } catch {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}

/** 🖼️ Upload profile picture */
export const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.file)
      return res.status(400).json({ error: req.t("errors.no_file") });

    const dir = path.join("uploads", "profiles");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const newFilePath = `/uploads/profiles/${req.file.filename}`;
    fs.renameSync(req.file.path, path.join(dir, req.file.filename));

    // Delete old image if exists
    const user = await db("users").where({ id: userId }).first();
    if (user?.profile_picture) {
      const oldPath = path.join(
        process.cwd(),
        user.profile_picture.startsWith("/")
          ? user.profile_picture.slice(1)
          : user.profile_picture,
      );
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.warn("⚠ Failed to delete old picture:", err.message);
        }
      }
    }

    await db("users").where({ id: userId }).update({
      profile_picture: newFilePath,
      updated_at: new Date(),
    });

    res.json({
      message: req.t("user.profile_picture_updated"),
      profile_picture: newFilePath,
    });
  } catch (err) {
    console.error("uploadProfilePicture error:", err);
    res.status(500).json({ error: req.t("common.server_error") });
  }
};

/** 📸 Get profile picture */
export const getProfilePicture = async (req, res) => {
  try {
    const user = await db("users")
      .select("profile_picture")
      .where({ id: req.user.id })
      .first();

    // ✅ No picture set -> 204 No Content (clean + not an "error")
    if (!user?.profile_picture) {
      return res.status(204).send();
    }

    const filePath = path.join(
      process.cwd(),
      user.profile_picture.startsWith("/")
        ? user.profile_picture.slice(1)
        : user.profile_picture,
    );

    // ✅ Picture path exists in DB but file missing -> also 204
    if (!fs.existsSync(filePath)) {
      return res.status(204).send();
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
    console.error("getProfilePicture error:", err);
    res.status(500).json({ error: req.t("common.server_error") });
  }
};

/** ❌ Delete farmer profile */
export async function deleteProfile(req, res) {
  try {
    await userService.deleteProfileById(req.user.id);
    res.json({ message: req.t("user.deleted") });
  } catch {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}

/* =======================================================================
   📧 EMAIL VERIFICATION & PASSWORD
======================================================================= */

/** 📮 Request verification code */
export async function requestEmailVerification(req, res) {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ error: req.t("validation.email_required") });

    const { code } = await userService.requestEmailVerification(
      req.user.id,
      email,
    );
    await sendMail({
      to: email,
      subject: "کد تایید ایمیل", // Keep subject in Persian for now, or i18n later
      html: `<h2>کد تایید شما</h2><p style="font-size:20px;font-weight:bold">${code}</p>`,
    });

    res.json({ message: req.t("user.verification_code_sent") });
  } catch (err) {
    res.status(500).json({ error: err.message || req.t("common.email_error") });
  }
}

/** ✅ Verify email */
export async function verifyEmail(req, res) {
  try {
    const { code } = req.body;
    if (!code)
      return res.status(400).json({ error: req.t("validation.code_required") });

    const user = await userService.verifyEmailCode(req.user.id, code);
    res.json({ profile: user, message: req.t("user.email_verified") });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** 🔐 Change password */
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res
        .status(400)
        .json({ error: req.t("validation.all_fields_required") });

    await userService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: req.t("user.password_changed") });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* =======================================================================
   📦 CONTAINERS & FILES
======================================================================= */
/* -------------------- Get Container Details -------------------- */
export const getContainerDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const data = await userService.getContainerDetails(id, userId);

    res.json(data);
  } catch (err) {
    console.error("getContainerDetails error:", err);
    res.status(400).json({ error: err.message });
  }
};

export async function updatePlanDate(req, res) {
  try {
    const { id } = req.params;
    const { plan_date } = req.body;
    const userId = req.user.id;

    const result = await farmerPlansService.setContainerPlanDate(
      id,
      plan_date,
      userId,
    );
    res.json(result);
  } catch (err) {
    console.error("updatePlanDate error:", err);
    res.status(400).json({ error: err.message });
  }
}

export async function getPlanDate(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await farmerPlansService.getContainerPlanDate(id, userId);
    res.json(result);
  } catch (err) {
    console.error("getPlanDate error:", err);
    res.status(400).json({ error: err.message });
  }
}

/** 📤 Upload container file */
export async function uploadFile(req, res) {
  try {
    const { containerId } = req.params;
    const file = req.file;
    if (!file)
      return res.status(400).json({ error: req.t("validation.file_required") });

    const destDir = path.join("uploads", "containers", String(containerId));
    fs.mkdirSync(destDir, { recursive: true });
    const newPath = path.join(destDir, file.originalname);
    fs.renameSync(file.path, newPath);

    const saved = await farmerPlansService.addFileToContainer(containerId, {
      key: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: "/" + newPath.replace(/\\/g, "/"),
      type: req.body.type || null,
    });

    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** 📂 List files of a container */
export async function listFiles(req, res) {
  try {
    const { containerId } = req.params;
    const files = await farmerPlansService.listFiles(containerId);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** 🔍 Get container metadata */
export const getContainerMetadata = async (req, res) => {
  try {
    const { id } = req.params;

    // roles might be ["admin"] OR [{name:"admin"}] depending on middleware
    const roles = (req.user.roles || []).map((r) =>
      typeof r === "string" ? r : r?.name,
    );

    const isAdmin = roles.includes("admin") || roles.includes("manager");

    let q = db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .where("c.id", id)
      .select("c.*")
      .first();

    // ✅ suppliers can only read their own container metadata
    if (!isAdmin) {
      q = db("farmer_plan_containers as c")
        .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
        .where("c.id", id)
        .andWhere("c.supplier_id", req.user.id)
        .select("c.*")
        .first();
    }

    const container = await q;

    if (!container) {
      return res
        .status(404)
        .json({ error: req.t("container.not_found_or_unauthorized") });
    }

    let metadata = {};
    try {
      metadata =
        typeof container.metadata === "string"
          ? JSON.parse(container.metadata)
          : container.metadata || {};
    } catch {
      metadata = {};
    }

    return res.json({
      metadata,
      metadata_status: container.metadata_status,
      metadata_review_note: container.metadata_review_note,
      tracking_code: container.tracking_code,
      supplier_id: container.supplier_id,
    });
  } catch (err) {
    console.error("getContainerMetadata error:", err);
    res.status(500).json({ error: req.t("common.server_error") });
  }
};

/** ✏️ Update container metadata */
export async function updateContainerMetadataController(req, res) {
  try {
    const result = await farmerPlansService.updateContainerMetadata(
      req.params.id,
      req.body,
      req.user.id,
      req.user.roles || [],
    );

    res.json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

/** 📋 List containers assigned to supplier (accepted requests only) with pagination + search */
export async function listAssignedContainers(req, res) {
  try {
    const supplierId = req.user?.id;
    if (!supplierId) {
      return res.status(401).json({ error: req.t("auth.unauthorized") });
    }

    const {
      page = "1",
      pageSize = "10",
      q = "",
      sortBy = "plan_date",
      sortOrder = "asc",
    } = req.query;

    const result = await farmerPlansService.listAssignedPlansWithContainers(
      supplierId,
      { page, pageSize, q, sortBy, sortOrder },
    );

    return res.json(result);
  } catch (err) {
    // Log full error server-side, return safe message to client
    console.error("listAssignedContainers error:", err);

    // If you throw custom errors with statusCode in your services, support them:
    const status =
      err?.statusCode && Number.isInteger(err.statusCode)
        ? err.statusCode
        : 500;

    return res.status(status).json({
      error: status === 500 ? req.t("common.server_error") : err.message,
    });
  }
}

/** 🔄 Update container status */
export async function updateContainerStatusController(req, res) {
  try {
    const result = await farmerPlansService.updateContainerStatus(
      req.params.id,
      req.user.id,
      req.body,
    );
    res.json({
      message: req.t("container.status_updated"),
      container: result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* =======================================================================
   🧭 CONTAINER TRACKING
======================================================================= */

/** 📜 List container tracking history */
export async function listContainerTracking(req, res) {
  try {
    const history = await farmerPlansService.getContainerTracking(
      req.params.id,
      req.user.id,
    );
    res.json(history);
  } catch {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}

/** ➕ Add new tracking status */
export async function addContainerTracking(req, res) {
  try {
    const { id } = req.params;
    const { status, note, tracking_code } = req.body;
    if (!status)
      return res
        .status(400)
        .json({ error: req.t("validation.status_required") });

    const result = await farmerPlansService.addContainerTracking({
      containerId: id,
      supplierId: req.user.id,
      status,
      note,
      tracking_code,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* =======================================================================
   🧰 UTILITIES
======================================================================= */

/** 👥 Minimal user list */
export async function getMinimalUsers(req, res) {
  try {
    const users = await userService.getMinimalUsers(req.query.role || null);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}
