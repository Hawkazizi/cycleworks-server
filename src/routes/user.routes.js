import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";
import db from "../db/knex.js";
const router = Router();

// User registration
router.post("/register", upload.array("files", 10), userController.register);
// User login
router.post("/login", userController.login);

router.get(
  "/profile",
  authenticate,
  authorize("user"),
  userController.getProfile
);
// Register a packing unit
router.post(
  "/packing-units",
  authenticate,
  authorize("user"),
  upload.array("documents", 5), // up to 5 files under field "documents"
  userController.registerPackingUnit
);

// Get my packing units
router.get(
  "/packing-units",
  authenticate,
  authorize("user"),
  userController.getMyPackingUnits
);
// Get all my export permit requests
router.get(
  "/permit-requests",
  authenticate,
  authorize("user"),
  userController.getMyPermitRequests
);

// Get single export permit request
router.get(
  "/permit-requests/:id",
  authenticate,
  authorize("user"),
  userController.getMyPermitRequestById
);

router.post(
  "/permit-requests",
  authenticate,
  authorize("user"),
  userController.requestExportPermit
);

// Weekly plans
router.get(
  "/weekly-plans",
  authenticate,
  authorize("user"),
  userController.getMyWeeklyPlans
);
router.get(
  "/weekly-plans/:id",
  authenticate,
  authorize("user"),
  userController.getMyWeeklyPlanById
);
// Submit weekly loading plan
router.post(
  "/weekly-plans",
  authenticate,
  authorize("user"),
  userController.submitWeeklyLoadingPlan
);

router.get("/settings", authenticate, authorize("user"), async (req, res) => {
  try {
    const settings = await db("settings").whereIn("key", [
      "submission_day",
      "weekly_tonnage_limit",
    ]);
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// QC submissions
router.get(
  "/qc-pre",
  authenticate,
  authorize("user"),
  userController.getMyQcSubmissions
);

router.post(
  "/qc-pre",
  authenticate,
  authorize("user"),
  upload.fields([
    { name: "carton_label", maxCount: 1 },
    { name: "egg_image", maxCount: 1 },
  ]),
  userController.submitQcPre
);

// Export documents
router.get(
  "/export-docs",
  authenticate,
  authorize("user"),
  userController.getMyExportDocs
);
// Export documents submission
router.post(
  "/export-docs",
  authenticate,
  authorize("user"),
  upload.fields([
    { name: "packing_list", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "veterinary_certificate", maxCount: 1 },
    { name: "export_permit_request_id", maxCount: 1 }, // 👈 add this so multer keeps it
  ]),
  userController.submitExportDocs
);

// Final documents
router.get(
  "/final-docs",
  authenticate,
  authorize("user"),
  userController.getMyFinalDocs
);
// Final documents submission
router.post(
  "/final-docs",
  authenticate,
  authorize("user"),
  upload.fields([
    { name: "certificate", maxCount: 1 },
    { name: "packing_list", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "customs_declaration", maxCount: 1 },
    { name: "shipping_license", maxCount: 1 },
    { name: "certificate_of_origin", maxCount: 1 },
    { name: "chamber_certificate", maxCount: 1 },
  ]),
  userController.submitFinalDocs
);

// routes/users.js
router.get(
  "/progress/:permitId",
  authenticate,
  authorize("user"),
  userController.getPermitProgress
);

//buyer part
router.get(
  "/buyer-requests",
  authenticate,
  authorize("user"),
  userController.listBuyerRequests
);

router.post(
  "/buyer-requests/:id/offers",
  authenticate,
  authorize("user"),
  userController.submitOffer
);
// Farmer offer management
router.get(
  "/offers",
  authenticate,
  authorize("user"),
  userController.getMyOffers
);

router.get(
  "/offers/:id",
  authenticate,
  authorize("user"),
  userController.getMyOfferById
);

router.patch(
  "/offers/:id",
  authenticate,
  authorize("user"),
  userController.updateOffer
);

router.delete(
  "/offers/:id",
  authenticate,
  authorize("user"),
  userController.cancelOffer
);

export default router;
