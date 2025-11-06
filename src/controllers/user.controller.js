import fs from "fs";
import path from "path";
import db from "../db/knex.js";
import { sendMail } from "../config/mailer.js";
import * as userService from "../services/user.service.js";
import * as farmerPlansService from "../services/farmerPlans.service.js";
import * as ticketService from "../services/ticket.service.js";

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
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });
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
      message: "درخواست ثبت شد، منتظر تأیید مدیر",
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
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });

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
    res.status(500).json({ error: "Failed to update profile" });
  }
}

/** 🖼️ Upload profile picture */
export const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

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
      message: "Profile picture updated",
      profile_picture: newFilePath,
    });
  } catch (err) {
    console.error("uploadProfilePicture error:", err);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
};

/** 📸 Get profile picture */
export const getProfilePicture = async (req, res) => {
  try {
    const user = await db("users")
      .select("profile_picture")
      .where({ id: req.user.id })
      .first();

    if (!user?.profile_picture)
      return res.status(404).json({ error: "Profile picture not found" });

    const filePath = path.join(
      process.cwd(),
      user.profile_picture.startsWith("/")
        ? user.profile_picture.slice(1)
        : user.profile_picture,
    );
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File not found on server" });

    const ext = path.extname(filePath).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    res.setHeader("Content-Type", mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(500).json({ error: "Failed to fetch profile picture" });
  }
};

/** ❌ Delete farmer profile */
export async function deleteProfile(req, res) {
  try {
    await userService.deleteProfileById(req.user.id);
    res.json({ message: "User deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete user" });
  }
}

/* =======================================================================
   📧 EMAIL VERIFICATION & PASSWORD
======================================================================= */

/** 📮 Request verification code */
export async function requestEmailVerification(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "ایمیل الزامی است" });

    const { code } = await userService.requestEmailVerification(
      req.user.id,
      email,
    );
    await sendMail({
      to: email,
      subject: "کد تایید ایمیل",
      html: `<h2>کد تایید شما</h2><p style="font-size:20px;font-weight:bold">${code}</p>`,
    });

    res.json({ message: "کد تایید ارسال شد" });
  } catch (err) {
    res.status(500).json({ error: err.message || "خطا در ارسال ایمیل" });
  }
}

/** ✅ Verify email */
export async function verifyEmail(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "کد الزامی است" });

    const user = await userService.verifyEmailCode(req.user.id, code);
    res.json({ profile: user, message: "ایمیل تایید شد" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/** 🔐 Change password */
export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "تمامی فیلدها الزامی است" });

    await userService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: "رمز عبور تغییر یافت" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/* =======================================================================
   📦 CONTAINERS & FILES
======================================================================= */

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
    if (!file) return res.status(400).json({ error: "File is required" });

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
    const supplierId = req.user.id;

    const container = await db("farmer_plan_containers as c")
      .join("farmer_plans as p", "c.plan_id", "p.id")
      .where("c.id", id)
      .where((q) =>
        q.where("c.supplier_id", supplierId).orWhere("p.farmer_id", supplierId),
      )
      .select("c.*")
      .first();

    if (!container)
      return res.status(404).json({ error: "Container not found" });

    const metadata = container.metadata ? JSON.parse(container.metadata) : {};
    res.json({ metadata, metadata_status: container.metadata_status });
  } catch {
    res.status(500).json({ error: "Failed to fetch container metadata" });
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

/** 📋 List containers assigned to supplier */
export async function listAssignedContainers(req, res) {
  try {
    const containers = await farmerPlansService.listAssignedPlansWithContainers(
      req.user.id,
    );
    res.json(containers);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
      message: "Container status updated successfully",
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
    res.status(500).json({ error: "Failed to fetch tracking history" });
  }
}

/** ➕ Add new tracking status */
export async function addContainerTracking(req, res) {
  try {
    const { id } = req.params;
    const { status, note, tracking_code } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });

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
   🎟️ TICKETS
======================================================================= */

/** 🆕 Create support ticket */
export const createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!message) return res.status(400).json({ error: "متن تیکت الزامی است" });

    const userId = req.user.id;
    const role = (req.user.roles && req.user.roles[0]) || "user";

    // Optional file upload
    let fileInfo = null;
    if (req.file) {
      const dir = path.join("uploads", "users", String(userId), "tickets");
      fs.mkdirSync(dir, { recursive: true });

      const filePath = path.join(dir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);
      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const ticket = await ticketService.createTicket({
      userId,
      role,
      subject,
      message,
      file: fileInfo,
    });

    res.status(201).json({ message: "تیکت ارسال شد", ticket });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** 📋 List user tickets */
export const getMyTickets = async (req, res) => {
  try {
    const tickets = await ticketService.getUserTickets(req.user.id);
    res.json(tickets);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/** ✏️ Update ticket */
export const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, message } = req.body;

    let fileInfo = null;
    if (req.file) {
      const dir = path.join("uploads", "users", String(req.user.id), "tickets");
      fs.mkdirSync(dir, { recursive: true });

      const filePath = path.join(dir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);
      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const updated = await ticketService.updateTicket({
      ticketId: id,
      userId: req.user.id,
      subject,
      message,
      file: fileInfo,
    });

    res.json({ message: "تیکت به‌روزرسانی شد", ticket: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* =======================================================================
   🧰 UTILITIES
======================================================================= */

/** 👥 Minimal user list */
export async function getMinimalUsers(req, res) {
  try {
    const users = await userService.getMinimalUsers(req.query.role || null);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
}
