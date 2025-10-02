import fs from "fs";
import path from "path";
import db from "../db/knex.js";
import * as userService from "../services/user.service.js";
import jwt from "jsonwebtoken";
import { sendMail } from "../config/mailer.js";
import * as farmerPlansService from "../services/farmerPlans.service.js";
import * as farmerBuyerService from "../services/farmerBuyer.service.js";
/* -------------------- Auth -------------------- */
export const register = async (req, res) => {
  try {
    const { name, mobile, password, reason, role } = req.body;

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
      role: chosenRole,
    });

    // prepare target folder
    const userDir = path.join(
      "uploads",
      "users",
      String(user.id),
      "registration"
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
      email
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

export async function createPlan(req, res) {
  try {
    const { requestId } = req.params; // ✅ not "id"
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
    const plans = await farmerPlansService.listPlansByRequest(
      requestId,
      farmerId
    );
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function uploadFile(req, res) {
  try {
    const { containerId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "File is required" });

    // Move to permanent dir
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
    });

    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

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
