import fs from "fs";
import path from "path";
import db from "../../common/db/knex.js";
import { sendMail } from "../../common/config/mailer.js";
import * as userService from "./user.service.js";
import * as supplierPlansService from "../supplierPlan/supplierPlans.service.js";

// ✅ Define project root once for consistent path resolution across OS (Windows/Linux)
const PROJECT_ROOT = process.cwd();
const TEMP_DIR_ABS = path.resolve(PROJECT_ROOT, "uploads", "temp");

/* =======================================================================
   📤 SINGLE FILE UPLOAD (NEW)
======================================================================= */

export const uploadSingleFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // ✅ Convert Multer's absolute path to a URL-friendly relative path
    // .replace(/\\/g, "/") ensures Windows backslashes become forward slashes for URLs
    const relativePath = path
      .relative(PROJECT_ROOT, req.file.path)
      .replace(/\\/g, "/");

    res.json({
      path: "/" + relativePath, // e.g., "/uploads/temp/161234567890-file.pdf"
      originalName: req.file.originalname,
      type: req.body.type,
    });
  } catch (err) {
    console.error("UPLOAD SINGLE FILE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

/* =======================================================================
   🔐 USER REGISTRATION (UPDATED)
======================================================================= */

export const register = async (req, res) => {
  try {
    const {
      name,
      mobile,
      email,
      password,
      reason,
      supplier_name,
      role,
      biosecurity,
      vaccination,
      emergency,
      foodSafety,
      description,
      farmBiosecurity,
    } = req.body;

    if (!password) {
      return res.status(400).json({
        error: req.t("validation.password_required") || "Password is required",
      });
    }
    if (!mobile && !email) {
      return res.status(400).json({ error: "Mobile or email is required" });
    }

    const chosenRole = role || "user";
    const { user, application } = await userService.registerUser({
      name,
      mobile,
      email,
      password,
      reason,
      supplier_name,
      role: chosenRole,
    });

    // ✅ Define absolute path for the user's final directory
    const userDirAbs = path.resolve(
      PROJECT_ROOT,
      "uploads",
      "users",
      String(user.id),
      "registration",
    );
    fs.mkdirSync(userDirAbs, { recursive: true });

    // ✅ Helper to securely move file from temp to user directory
    const moveFile = (fileData) => {
      if (!fileData || !fileData.path) return null;

      const tempPath = fileData.path; // e.g., "/uploads/temp/123-file.pdf"
      const originalName = fileData.originalname || path.basename(tempPath);

      // 1. Clean the path (remove leading slashes)
      let cleanPath = tempPath.replace(/^\/+/, "");

      // 2. Resolve to absolute path based on PROJECT_ROOT
      const absoluteTempPath = path.resolve(PROJECT_ROOT, cleanPath);

      // 3. Security check: ensure it's strictly within the temp directory
      // We add path.sep to prevent matching a directory named "temp_extra"
      if (
        !absoluteTempPath.startsWith(TEMP_DIR_ABS + path.sep) &&
        absoluteTempPath !== TEMP_DIR_ABS
      ) {
        console.warn("Attempted to access file outside temp dir:", tempPath);
        return null;
      }

      // 4. Check if file exists
      if (!fs.existsSync(absoluteTempPath)) {
        console.warn("Temp file not found:", absoluteTempPath);
        return null;
      }

      // 5. Determine final absolute path, handling collisions
      let finalPathAbs = path.join(userDirAbs, originalName);
      let counter = 1;
      while (fs.existsSync(finalPathAbs)) {
        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);
        finalPathAbs = path.join(
          userDirAbs,
          `${nameWithoutExt}-${counter}${ext}`,
        );
        counter++;
      }

      // 6. Move the file using absolute paths (prevents any CWD issues on VPS)
      fs.renameSync(absoluteTempPath, finalPathAbs);

      // 7. Return the relative URL path for the database (always use forward slashes for URLs)
      const relativeUrlPath =
        "/" + path.relative(PROJECT_ROOT, finalPathAbs).replace(/\\/g, "/");

      return {
        filename: path.basename(finalPathAbs),
        path: relativeUrlPath,
        originalname: originalName, // ✅ Super Admin UI expects this exact key
      };
    };

    const fileInfos = {
      biosecurity: moveFile(biosecurity),
      vaccination: moveFile(vaccination),
      emergency: moveFile(emergency),
      food_safety: moveFile(foodSafety),
      description: moveFile(description),
      farm_biosecurity: moveFile(farmBiosecurity),
    };

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

/** ✅ NEW: Verify Registration Code (Public) */
export const verifyRegistration = async (req, res) => {
  try {
    const { identifier, code } = req.body;
    if (!identifier || !code) {
      return res.status(400).json({ error: "شناسه و کد الزامی است" });
    }
    const result = await userService.verifyRegistrationCode(identifier, code);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { mobile, email, password, identifier } = req.body;
    const loginIdentifier = identifier || mobile || email;

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        error:
          req.t("validation.mobile_password_required") ||
          "Mobile/Email and password are required",
      });
    }

    const result = await userService.loginUser({
      identifier: loginIdentifier,
      password,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    const result = await userService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message, code: "REFRESH_TOKEN_INVALID" });
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    await userService.logoutUser(refreshToken);
    res.json({
      message: req.t("user.logged_out") || "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({ error: req.t("common.server_error") });
  }
};

/* =======================================================================
   🔄 FORGOT PASSWORD CONTROLLERS
======================================================================= */

export const sendForgotPasswordCodeController = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res
        .status(400)
        .json({ error: "شناسه (موبایل یا ایمیل) الزامی است" });
    }

    await userService.sendForgotPasswordCode(identifier);
    res.json({
      message: req.t("user.forgot_password.code_sent") || "کد بازیابی ارسال شد",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const resetPasswordController = async (req, res) => {
  try {
    const { identifier, code, newPassword } = req.body;
    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ error: "تمام فیلدها الزامی هستند" });
    }

    await userService.resetPasswordWithCode(identifier, code, newPassword);
    res.json({
      message:
        req.t("user.forgot_password.password_reset") ||
        "رمز عبور با موفقیت تغییر کرد",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   👤 PROFILE MANAGEMENT
======================================================================= */

export const getProfile = async (req, res) => {
  try {
    const profile = await userService.getUserProfile(req.user.id);
    res.json({ profile });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

export async function updateProfile(req, res) {
  try {
    const updated = await userService.updateProfileById(req.user.id, req.body);
    res.json({ profile: updated });
  } catch {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}

export const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.file)
      return res.status(400).json({ error: req.t("errors.no_file") });

    const dir = path.join("uploads", "profiles");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const newFilePath = `/uploads/profiles/${req.file.filename}`;
    fs.renameSync(req.file.path, path.join(dir, req.file.filename));

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

export const getProfilePicture = async (req, res) => {
  try {
    const user = await db("users")
      .select("profile_picture")
      .where({ id: req.user.id })
      .first();

    if (!user?.profile_picture) {
      return res.status(204).send();
    }

    const filePath = path.join(
      process.cwd(),
      user.profile_picture.startsWith("/")
        ? user.profile_picture.slice(1)
        : user.profile_picture,
    );

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
      subject: "کد تایید ایمیل",
      html: `<h2>کد تایید شما</h2><p style="font-size:20px;font-weight:bold">${code}</p>`,
    });

    res.json({ message: req.t("user.verification_code_sent") });
  } catch (err) {
    res.status(500).json({ error: err.message || req.t("common.email_error") });
  }
}

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

    const result = await supplierPlansService.setContainerPlanDate(
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

    const result = await supplierPlansService.getContainerPlanDate(id, userId);
    res.json(result);
  } catch (err) {
    console.error("getPlanDate error:", err);
    res.status(400).json({ error: err.message });
  }
}

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

    const saved = await supplierPlansService.addFileToContainer(containerId, {
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

export async function listFiles(req, res) {
  try {
    const { containerId } = req.params;
    const files = await supplierPlansService.listFiles(containerId);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const getContainerMetadata = async (req, res) => {
  try {
    const { id } = req.params;

    const roles = (req.user.roles || []).map((r) =>
      typeof r === "string" ? r : r?.name,
    );

    const isAdmin = roles.includes("admin") || roles.includes("manager");

    let q = db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .where("c.id", id)
      .select("c.*")
      .first();

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

export async function updateContainerMetadataController(req, res) {
  try {
    const result = await supplierPlansService.updateContainerMetadata(
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

    const result = await supplierPlansService.listAssignedPlansWithContainers(
      supplierId,
      { page, pageSize, q, sortBy, sortOrder },
    );

    return res.json(result);
  } catch (err) {
    console.error("listAssignedContainers error:", err);

    const status =
      err?.statusCode && Number.isInteger(err.statusCode)
        ? err.statusCode
        : 500;

    return res.status(status).json({
      error: status === 500 ? req.t("common.server_error") : err.message,
    });
  }
}

export async function updateContainerStatusController(req, res) {
  try {
    const result = await supplierPlansService.updateContainerStatus(
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

export async function listContainerTracking(req, res) {
  try {
    const history = await supplierPlansService.getContainerTracking(
      req.params.id,
      req.user.id,
    );
    res.json(history);
  } catch {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}

export async function addContainerTracking(req, res) {
  try {
    const { id } = req.params;
    const { status, note, tracking_code } = req.body;
    if (!status)
      return res
        .status(400)
        .json({ error: req.t("validation.status_required") });

    const result = await supplierPlansService.addContainerTracking({
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

export async function getMinimalUsers(req, res) {
  try {
    const users = await userService.getMinimalUsers(req.query.role || null);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: req.t("common.server_error") });
  }
}
