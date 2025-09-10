import * as userService from "../services/user.service.js";

// Register a new user
export const register = async (req, res) => {
  try {
    const { name, email, password, reason } = req.body;
    const result = await userService.registerUser({
      name,
      email,
      password,
      reason,
    });
    res.status(201).json(result);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await userService.loginUser({ email, password });
    res.json(result);
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
