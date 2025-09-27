import fs from "fs";
import path from "path";
import db from "../db/knex.js";
import * as userService from "../services/user.service.js";
import * as farmerOfferService from "../services/farmerOffer.service.js";

export const register = async (req, res) => {
  try {
    const { name, mobile, password, reason, role } = req.body;

    if (!mobile || !password) {
      return res
        .status(400)
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });
    }

    const chosenRole = role || "user";

    // register user + application
    const { user, application } = await userService.registerUser({
      name,
      mobile,
      password,
      reason,
      role: chosenRole,
    });

    // === handle uploaded files ===
    let fileInfos = [];
    if (req.files && req.files.length > 0) {
      const userDir = path.join(
        "uploads",
        "users",
        String(user.id),
        "registration"
      );
      fs.mkdirSync(userDir, { recursive: true });

      fileInfos = req.files.map((file) => {
        const newPath = path.join(userDir, file.filename);
        fs.renameSync(file.path, newPath); // move from temp to user folder

        return {
          filename: file.filename,
          path: "/" + newPath.replace(/\\/g, "/"), // normalize slashes
          mimetype: file.mimetype,
        };
      });
      // update application with files JSON
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

// Login user with mobile + password
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

// Send SMS verification code
export const sendCode = async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile)
      return res.status(400).json({ error: "شماره موبایل الزامی است" });

    let user = await db("users").where({ mobile }).first();
    if (!user) {
      const [id] = await db("users")
        .insert({ mobile, status: "pending" })
        .returning("id");
      user = { id, mobile };
    }

    await userService.createCode(mobile, user.id);
    res.json({ status: 1, message: "کد ارسال شد" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Verify SMS code and issue JWT
export const verifyCode = async (req, res) => {
  try {
    const { mobile, code } = req.body;
    if (!mobile || !code)
      return res.status(400).json({ error: "ورودی ناقص است" });

    const record = await userService.verifyUserCode(mobile, code);
    const user = await db("users").where({ id: record.user_id }).first();

    const token = jwt.sign(
      { role: "user", id: user.id },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    res.json({ token, role: "user", user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get user profile
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // from JWT
    const profile = await userService.getUserProfile(userId);
    res.json({ profile });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

export const registerPackingUnit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, address } = req.body;

    // create unit first (without documents)
    const unit = await userService.registerPackingUnit(userId, {
      name,
      address,
    });

    // handle documents
    let fileInfos = [];
    if (req.files && req.files.length > 0) {
      const unitDir = path.join(
        "uploads",
        "users",
        String(userId),
        "packing-units",
        String(unit.id)
      );
      fs.mkdirSync(unitDir, { recursive: true });

      fileInfos = req.files.map((file) => {
        const newPath = path.join(unitDir, file.filename);
        fs.renameSync(file.path, newPath);

        return {
          filename: file.filename,
          path: "/" + newPath.replace(/\\/g, "/"),
          mimetype: file.mimetype,
        };
      });

      // update unit with documents
      await db("packing_units")
        .where({ id: unit.id })
        .update({ documents: JSON.stringify(fileInfos) });
      unit.documents = fileInfos;
    }

    res.status(201).json({ message: "Packing unit registered", unit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getMyPackingUnits = async (req, res) => {
  try {
    const userId = req.user.id;
    const units = await userService.getMyPackingUnits(userId);
    res.json({ units });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const requestExportPermit = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      packing_unit_id,
      destination_country,
      max_tonnage,
      buyer_request_id,
    } = req.body;

    const permit = await userService.requestExportPermit(userId, {
      packing_unit_id,
      destination_country,
      max_tonnage,
      buyer_request_id,
    });

    res.status(201).json({ message: "Export permit requested", permit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getMyPermitRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const permits = await userService.getMyPermitRequests(userId);
    res.json({ permits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyPermitRequestById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const permit = await userService.getMyPermitRequestById(userId, id);
    res.json({ permit });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

// Weekly plans
export const getMyWeeklyPlans = async (req, res) => {
  try {
    const userId = req.user.id;
    const plans = await userService.getMyWeeklyPlans(userId);
    res.json({ plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyWeeklyPlanById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const plan = await userService.getMyWeeklyPlanById(userId, id);
    res.json({ plan });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

// Submit weekly loading plan
export const submitWeeklyLoadingPlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { export_permit_request_id, week_start_date, details } = req.body;
    const result = await userService.submitWeeklyLoadingPlan(userId, {
      export_permit_request_id,
      week_start_date,
      details,
    });
    res
      .status(201)
      .json({ message: "Weekly loading plan submitted", ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// QC submissions
export const getMyQcSubmissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const qc = await userService.getMyQcSubmissions(userId);
    res.json({ qc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const submitQcPre = async (req, res) => {
  try {
    const userId = req.user.id;
    const { weekly_loading_plan_id } = req.body;

    let cartonLabelPath = null;
    let eggImagePath = null;

    if (req.files?.carton_label) {
      const file = req.files.carton_label[0];
      const qcDir = path.join("uploads", "qc", String(weekly_loading_plan_id));
      fs.mkdirSync(qcDir, { recursive: true });
      const newPath = path.join(qcDir, file.filename);
      fs.renameSync(file.path, newPath);
      cartonLabelPath = "/" + newPath.replace(/\\/g, "/");
    }

    if (req.files?.egg_image) {
      const file = req.files.egg_image[0];
      const qcDir = path.join("uploads", "qc", String(weekly_loading_plan_id));
      fs.mkdirSync(qcDir, { recursive: true });
      const newPath = path.join(qcDir, file.filename);
      fs.renameSync(file.path, newPath);
      eggImagePath = "/" + newPath.replace(/\\/g, "/");
    }

    const qc = await userService.submitQcPreProduction(userId, {
      weekly_loading_plan_id,
      carton_label: cartonLabelPath,
      egg_image: eggImagePath,
    });

    res.status(201).json({ message: "QC submitted", qc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Export documents
// Export documents
export const getMyExportDocs = async (req, res) => {
  try {
    const userId = req.user.id;
    const docs = await userService.getMyExportDocs(userId);
    res.json({ docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const submitExportDocs = async (req, res) => {
  try {
    const userId = req.user.id;
    let { export_permit_request_id } = req.body;

    if (!export_permit_request_id) {
      return res
        .status(400)
        .json({ error: "export_permit_request_id is required" });
    }

    export_permit_request_id = Number(export_permit_request_id);

    const docDir = path.join(
      "uploads",
      "export-docs",
      String(export_permit_request_id)
    );
    fs.mkdirSync(docDir, { recursive: true });

    let filePaths = {};
    if (req.files?.packing_list) {
      const file = req.files.packing_list[0];
      const newPath = path.join(docDir, file.filename);
      fs.renameSync(file.path, newPath);
      filePaths.packing_list = "/" + newPath.replace(/\\/g, "/");
    }
    if (req.files?.invoice) {
      const file = req.files.invoice[0];
      const newPath = path.join(docDir, file.filename);
      fs.renameSync(file.path, newPath);
      filePaths.invoice = "/" + newPath.replace(/\\/g, "/");
    }
    if (req.files?.veterinary_certificate) {
      const file = req.files.veterinary_certificate[0];
      const newPath = path.join(docDir, file.filename);
      fs.renameSync(file.path, newPath);
      filePaths.veterinary_certificate = "/" + newPath.replace(/\\/g, "/");
    }

    const doc = await userService.submitExportDocuments(userId, {
      export_permit_request_id,
      ...filePaths,
    });

    res.status(201).json({ message: "Export documents submitted", doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Final documents
export const getMyFinalDocs = async (req, res) => {
  try {
    const userId = req.user.id;
    const docs = await userService.getMyFinalDocs(userId);
    res.json({ docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const submitFinalDocs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { export_permit_request_id } = req.body;

    if (!export_permit_request_id) {
      return res
        .status(400)
        .json({ error: "export_permit_request_id is required" });
    }

    const finalDir = path.join(
      "uploads",
      "final-docs",
      String(export_permit_request_id)
    );
    fs.mkdirSync(finalDir, { recursive: true });

    // Collect file paths
    const fields = [
      "certificate",
      "packing_list",
      "invoice",
      "customs_declaration",
      "shipping_license",
      "certificate_of_origin",
      "chamber_certificate",
    ];

    let filePaths = {};
    for (const field of fields) {
      if (req.files?.[field]) {
        const file = req.files[field][0];
        const newPath = path.join(finalDir, file.filename);
        fs.renameSync(file.path, newPath);
        filePaths[field] = "/" + newPath.replace(/\\/g, "/");
      }
    }

    const finalDoc = await userService.submitFinalDocuments(userId, {
      export_permit_request_id,
      ...filePaths,
    });

    res.status(201).json({ message: "Final documents submitted", finalDoc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getPermitProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { permitId } = req.params;

    const data = await userService.getPermitProgress(userId, permitId);
    res.json({ progress: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
//buyer part

export async function listBuyerRequests(req, res) {
  try {
    const requests = await farmerOfferService.listBuyerRequestsForFarmers(
      req.user.id
    );
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function submitOffer(req, res) {
  try {
    const offer = await farmerOfferService.submitOffer(
      req.params.id,
      req.user.id,
      req.body.offer_quantity
    );
    res.json(offer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
export async function getMyOffers(req, res) {
  const offers = await farmerOfferService.getMyOffers(req.user.id);
  res.json(offers);
}

export async function getMyOfferById(req, res) {
  const offer = await farmerOfferService.getMyOfferById(
    req.user.id,
    req.params.id
  );
  if (!offer) return res.status(404).json({ error: "Not found" });
  res.json(offer);
}

export async function updateOffer(req, res) {
  try {
    const updated = await farmerOfferService.updateOffer(
      req.user.id,
      req.params.id,
      req.body
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function cancelOffer(req, res) {
  try {
    const cancelled = await farmerOfferService.cancelOffer(
      req.user.id,
      req.params.id
    );
    res.json(cancelled);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
