import { Router } from "express";
import * as buyerController from "../controllers/buyer.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.get(
  "/profile",
  authenticate,
  authorize("buyer"),
  buyerController.getProfile
);

// Buyer history (all requests with any status)
router.get(
  "/requests/history",
  authenticate,
  authorize("buyer"),
  buyerController.getMyRequestHistory
);

router.post(
  "/requests",
  authenticate,
  authorize("buyer"),
  buyerController.createRequest
);
router.get(
  "/requests",
  authenticate,
  authorize("buyer"),
  buyerController.getMyRequests
);
router.get(
  "/requests/:id",
  authenticate,
  authorize("buyer"),
  buyerController.getRequestById
);

// Update buyer request (only if still pending)
router.patch(
  "/requests/:id",
  authenticate,
  authorize("buyer"),
  buyerController.updateRequest
);

// Cancel buyer request (soft delete = status=cancelled)
router.delete(
  "/requests/:id",
  authenticate,
  authorize("buyer"),
  buyerController.cancelRequest
);
// Buyer offers
router.get(
  "/offers",
  authenticate,
  authorize("buyer"),
  buyerController.getOffersForBuyer
);

export default router;
