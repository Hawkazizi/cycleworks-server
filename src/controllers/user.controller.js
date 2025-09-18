import * as userService from "../services/user.service.js";

// Register a new user with mobile + password
export const register = async (req, res) => {
  try {
    const { name, mobile, password, reason } = req.body;
    if (!mobile || !password) {
      return res
        .status(400)
        .json({ error: "شماره موبایل و رمز عبور الزامی است" });
    }

    const result = await userService.registerUser({
      name,
      mobile,
      password,
      reason,
    });
    res.status(201).json(result);
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
      process.env.JWT_SECRET,
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

export const requestExportPermit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { packing_unit_id, destination_country, max_tonnage } = req.body;
    const permit = await userService.requestExportPermit(userId, {
      packing_unit_id,
      destination_country,
      max_tonnage,
    });
    res.status(201).json({ message: "Export permit requested", permit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const registerPackingUnit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, address, document_1, document_2 } = req.body;
    const unit = await userService.registerPackingUnit(userId, {
      name,
      address,
      document_1,
      document_2,
    });
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
    const qc = await userService.submitQcPreProduction(userId, req.body);
    res.status(201).json({ message: "QC submitted", qc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

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
    const doc = await userService.submitExportDocuments(userId, req.body);
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
    const finalDoc = await userService.submitFinalDocuments(userId, req.body);
    res.status(201).json({ message: "Final documents submitted", finalDoc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
