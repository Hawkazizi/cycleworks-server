import fs from "fs";
import path from "path";
import db from "../db/knex.js";
import * as userService from "../services/user.service.js";
import jwt from "jsonwebtoken";
import { sendMail } from "../config/mailer.js";
import * as farmerPlansService from "../services/farmerPlans.service.js";
import * as farmerBuyerService from "../services/farmerBuyer.service.js";
import * as ticketService from "../services/ticket.service.js";
/* -------------------- Auth -------------------- */
export const register = async (req, res) => {
  try {
    const { name, mobile, password, reason, supplier_name, role } = req.body;
    // validate required fields
    if (!mobile || !password) {
      return res
        .status(400)
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });
    }

    const chosenRole = role || "user";

    // create user + application
    const { user, application } = await userService.registerUser({
      name,
      mobile,
      password,
      reason,
      supplier_name,
      role: chosenRole,
    });

    // prepare target folder
    const userDir = path.join(
      "uploads",
      "users",
      String(user.id),
      "registration",
    );
    fs.mkdirSync(userDir, { recursive: true });

    // helper to move files
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

    // pick files from multer
    const fileInfos = {
      biosecurity: saveFile(req.files?.biosecurity?.[0]),
      vaccination: saveFile(req.files?.vaccination?.[0]),
      emergency: saveFile(req.files?.emergency?.[0]),
      food_safety: saveFile(req.files?.foodSafety?.[0]),
      description: saveFile(req.files?.description?.[0]),
      farm_biosecurity: saveFile(req.files?.farmBiosecurity?.[0]),
    };

    // update application with file metadata
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

export const login = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password) {
      return res
        .status(400)
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });
    }

    const result = await userService.loginUser({ mobile, password });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await userService.getUserProfile(userId);
    res.json({ profile });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

export async function updateProfile(req, res) {
  try {
    const updated = await userService.updateProfileById(req.user.id, req.body);
    res.json({ profile: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
}

export async function deleteProfile(req, res) {
  try {
    await userService.deleteProfileById(req.user.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
}
/* -------------------- email verification -------------------- */

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
      text: `کد تایید شما: ${code}`,
      html: `<h2>کد تایید شما</h2><p style="font-size:20px;font-weight:bold">${code}</p><p>این کد به مدت ۱۵ دقیقه معتبر است.</p>`,
    });

    res.json({ message: "کد تایید ارسال شد" });
  } catch (err) {
    res.status(500).json({ error: err.message || "خطا در ارسال ایمیل" });
  }
}

export async function verifyEmail(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "کد الزامی است" });

    const user = await userService.verifyEmailCode(req.user.id, code);
    res.json({ profile: user, message: "ایمیل با موفقیت تایید شد" });
  } catch (err) {
    res.status(400).json({ error: err.message || "خطا در تایید ایمیل" });
  }
}
/* -------------------- Change Password -------------------- */

export async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "تمامی فیلدها الزامی است" });
    }
    await userService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: "رمز عبور تغییر یافت" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
/* -------------------- Reqs -------------------- */

export async function createPlan(req, res) {
  try {
    const { requestId } = req.params;
    const { planDate, containerAmount } = req.body;
    const farmerId = req.user.id;

    const plan = await farmerPlansService.createPlan({
      requestId,
      farmerId,
      planDate,
      containerAmount: Number(containerAmount),
    });

    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listPlans(req, res) {
  try {
    const { requestId } = req.params;
    const farmerId = req.user.id;

    const result = await farmerPlansService.listPlansWithContainers(
      requestId,
      farmerId,
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ---------- Containers ---------- */
export async function listContainers(req, res) {
  try {
    const { planId } = req.params;
    const containers = await farmerPlansService.getContainersByPlan(planId);
    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ---------- Files ---------- */
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

export async function listFiles(req, res) {
  try {
    const { containerId } = req.params;
    const files = await farmerPlansService.listFiles(containerId);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ---------- Farmer Requests ---------- */
export async function listFarmerRequests(req, res) {
  try {
    const farmerId = req.user.id;
    const requests = await farmerBuyerService.getFarmerRequests(farmerId);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getFarmerRequest(req, res) {
  try {
    const farmerId = req.user.id;
    const { id } = req.params;
    const request = await farmerBuyerService.getFarmerRequestById(farmerId, id);
    if (!request) return res.status(404).json({ error: "Request not found" });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
export async function updateFarmerRequestStatus(req, res) {
  try {
    const { farmer_status } = req.body;

    const updated = await userService.updateFarmerRequestStatus(
      req.user.id,
      req.params.id,
      farmer_status,
    );

    res.json({
      message:
        farmer_status === "rejected"
          ? "درخواست با موفقیت رد شد."
          : "درخواست تایید شد.",
      request: updated,
    });
  } catch (err) {
    console.log("🔍 ERROR:", err.message); // 🚨 ADD THIS
    res.status(400).json({ error: err.message });
  }
}
/* -------------------- Tickets -------------------------- */

/* -------------------- Create Ticket -------------------- */
export const createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const userId = req.user.id; // from authenticate middleware
    const role = req.user.role || "user";

    if (!message) {
      return res.status(400).json({ error: "متن تیکت الزامی است" });
    }

    // handle file upload (if exists)
    let fileInfo = null;
    if (req.file) {
      const userDir = path.join("uploads", "users", String(userId), "tickets");
      fs.mkdirSync(userDir, { recursive: true });

      const filePath = path.join(userDir, req.file.originalname);
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

    res.status(201).json({
      message: "تیکت با موفقیت ارسال شد",
      ticket,
    });
  } catch (err) {
    console.error("CREATE TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- List User Tickets -------------------- */
export const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const tickets = await ticketService.getUserTickets(userId);
    res.json(tickets);
  } catch (err) {
    console.error("GET TICKETS ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

/* -------------------- Update User Tickets -------------------- */
export const updateTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const userId = req.user.id;
    const { subject, message } = req.body;

    let fileInfo = null;
    if (req.file) {
      const userDir = path.join("uploads", "users", String(userId), "tickets");
      fs.mkdirSync(userDir, { recursive: true });
      const filePath = path.join(userDir, req.file.originalname);
      fs.renameSync(req.file.path, filePath);

      fileInfo = {
        path: "/" + filePath.replace(/\\/g, "/"),
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      };
    }

    const updated = await ticketService.updateTicket({
      ticketId,
      userId,
      subject,
      message,
      file: fileInfo,
    });

    res.json({
      message: "تیکت با موفقیت به‌روزرسانی شد",
      ticket: updated,
    });
  } catch (err) {
    console.error("UPDATE TICKET ERROR:", err);
    res.status(400).json({ error: err.message });
  }
};

export async function getMinimalUsers(req, res) {
  try {
    const role = req.query.role || null;
    const users = await userService.getMinimalUsers(role);
    res.json(users);
  } catch (err) {
    console.error("❌ Error fetching minimal users:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
}

export async function updateContainerMetadataController(req, res) {
  try {
    const { id } = req.params; // container id
    const userId = req.user.id;
    const { metadata } = req.body;

    const result = await farmerPlansService.updateContainerMetadata(
      id,
      metadata,
      userId,
    );
    res.json(result);
  } catch (err) {
    console.error("updateContainerMetadata error:", err);
    res.status(400).json({ message: err.message });
  }
}
