import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";

const router = Router();

/* -------------------- Auth -------------------- */
router.post("/register", upload.array("files", 10), userController.register);
router.post("/login", userController.login);
router.get(
  "/profile",
  authenticate,
  authorize("user"),
  userController.getProfile
);

/* -------------------- Buyer Requests (Farmer actions) -------------------- */
router.get(
  "/buyer-requests",
  authenticate,
  authorize("user"),
  userController.listBuyerRequests
);

// Accept/reject + start_date if accepted
router.post(
  "/buyer-requests/:id/review",
  authenticate,
  authorize("user"),
  userController.reviewBuyerRequest
);

// Submit all final docs after acceptance
router.post(
  "/buyer-requests/:id/submit",
  authenticate,
  authorize("user"),
  upload.fields([
    { name: "invoice", maxCount: 1 },
    { name: "packing_list", maxCount: 1 },
    { name: "certificate", maxCount: 1 },
    { name: "bijak", maxCount: 1 },
    { name: "certificate_of_origin", maxCount: 1 },
    { name: "customs_declaration", maxCount: 1 },
    { name: "scale_slip", maxCount: 1 },
    { name: "carton_label", maxCount: 1 },
    { name: "egg_image", maxCount: 1 },
    { name: "tynumber", maxCount: 1 },
  ]),
  userController.submitPlanAndDocs
);

export default router;
