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

export const submitQcPre = async (req, res) => {
  try {
    const userId = req.user.id;
    const qc = await userService.submitQcPreProduction(userId, req.body);
    res.status(201).json({ message: "QC submitted", qc });
  } catch (err) {
    res.status(400).json({ error: err.message });
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

export const submitFinalDocs = async (req, res) => {
  try {
    const userId = req.user.id;
    const finalDoc = await userService.submitFinalDocuments(userId, req.body);
    res.status(201).json({ message: "Final documents submitted", finalDoc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
