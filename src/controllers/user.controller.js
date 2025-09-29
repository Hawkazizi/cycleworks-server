import fs from "fs";
import path from "path";
import db from "../db/knex.js";
import * as userService from "../services/user.service.js";
import jwt from "jsonwebtoken";

/* -------------------- Auth -------------------- */
export const register = async (req, res) => {
  try {
    const { name, mobile, password, reason, role } = req.body;

    if (!mobile || !password) {
      return res
        .status(400)
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });
    }

    const chosenRole = role || "user";
    const { user, application } = await userService.registerUser({
      name,
      mobile,
      password,
      reason,
      role: chosenRole,
    });

    // save registration files if uploaded
    let fileInfos = [];
    if (req.files?.length > 0) {
      const userDir = path.join(
        "uploads",
        "users",
        String(user.id),
        "registration"
      );
      fs.mkdirSync(userDir, { recursive: true });

      fileInfos = req.files.map((file) => {
        const newPath = path.join(userDir, file.filename);
        fs.renameSync(file.path, newPath);
        return {
          filename: file.filename,
          path: "/" + newPath.replace(/\\/g, "/"),
          mimetype: file.mimetype,
        };
      });

      await db("user_applications")
        .where({ id: application.id })
        .update({ files: JSON.stringify(fileInfos) });
    }

    res.status(201).json({
      user,
      application: { ...application, files: fileInfos },
      message: "درخواست ثبت شد، منتظر تأیید مدیر",
    });
  } catch (err) {
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

/* -------------------- Buyer Requests (Farmer flow) -------------------- */

// List buyer requests available for this farmer
export async function listBuyerRequests(req, res) {
  try {
    const requests = await userService.listBuyerRequestsForFarmer(req.user.id);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function reviewBuyerRequest(req, res) {
  try {
    const { id } = req.params;
    const { decision, start_date } = req.body;
    const userId = req.user.id;

    if (decision === "accepted" && !start_date) {
      return res
        .status(400)
        .json({ error: "start_date is required when accepting" });
    }

    const updateData = {
      farmer_status: decision,
      updated_at: db.fn.now(),
    };

    if (decision === "accepted") {
      // 🔹 compute end_date (7 days after start_date)
      const start = new Date(start_date);
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const end_date = end.toISOString().split("T")[0]; // YYYY-MM-DD

      updateData.farmer_plan = { start_date, end_date }; // ✅ store both
      updateData.preferred_supplier_id = userId; // ✅ assign supplier
    } else {
      updateData.farmer_plan = null; // clear plan if rejected
    }

    const [updated] = await db("buyer_requests")
      .where({ id })
      .update(updateData)
      .returning("*");

    if (!updated) return res.status(404).json({ error: "Request not found" });

    res.json(updated);
  } catch (err) {
    console.error("reviewBuyerRequest error:", err);
    res.status(400).json({ error: err.message });
  }
}

// Farmer submits all final docs after acceptance

export const submitPlanAndDocs = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = req.params.id;

    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
    const destDir = path.join(
      "uploads",
      "users",
      String(userId),
      "buyer-requests",
      String(requestId),
      "final-docs"
    );
    fs.mkdirSync(destDir, { recursive: true });

    const docs = [];

    // Loop over known fields
    Object.keys(req.files || {}).forEach((field) => {
      const file = req.files[field][0];
      if (file) {
        const newPath = path.join(destDir, file.filename);
        fs.renameSync(file.path, newPath);

        docs.push({
          type: field, // e.g. invoice, packing_list
          filename: file.originalname,
          path: `${BASE_URL}/${newPath.replace(/\\/g, "/")}`,
        });
      }
    });

    const updated = await userService.submitPlanAndDocs(
      userId,
      requestId,
      docs
    );

    res.json(updated);
  } catch (err) {
    console.error("submitPlanAndDocs error:", err);
    res.status(400).json({ error: err.message });
  }
};
