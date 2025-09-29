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

// Create request
router.post(
  "/requests",
  authenticate,
  authorize("buyer"),
  buyerController.createRequest
);

// List my requests
router.get(
  "/requests",
  authenticate,
  authorize("buyer"),
  buyerController.getMyRequests
);

// Get single request
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

// Minimal users (for buyer to select farmer)
router.get(
  "/users/minimal",
  authenticate,
  authorize("buyer"),
  buyerController.getMinimalUsers
);

export default router;
