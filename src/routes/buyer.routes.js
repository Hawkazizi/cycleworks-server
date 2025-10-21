import { Router } from "express";
import * as buyerController from "../controllers/buyer.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";
const router = Router();

router.get(
  "/profile",
  authenticate,
  authorize("buyer"),
  buyerController.getProfile,
);

router.put(
  "/profile",
  authenticate,
  authorize("buyer"),
  buyerController.updateProfile,
);

// Create request
router.post(
  "/requests",
  authenticate,
  authorize("buyer"),
  buyerController.createRequest,
);

// List my requests
router.get(
  "/requests",
  authenticate,
  authorize("buyer"),
  buyerController.getMyRequests,
);

// Get single request
router.get(
  "/requests/:id",
  authenticate,
  authorize("buyer"),
  buyerController.getRequestById,
);

// Update buyer request (only if still pending)
router.patch(
  "/requests/:id",
  authenticate,
  authorize("buyer"),
  buyerController.updateRequest,
);

// Cancel buyer request (soft delete = status=cancelled)
router.delete(
  "/requests/:id",
  authenticate,
  authorize("buyer"),
  buyerController.cancelRequest,
);

// Minimal users (for buyer to select farmer)
router.get(
  "/users/minimal",
  authenticate,
  authorize("buyer"),
  buyerController.getMinimalUsers,
);
/* -------------------- Tickets -------------------- */
router.post(
  "/tickets",
  authenticate,
  upload.single("attachment"),
  authorize("buyer"),
  buyerController.createBuyerTicket,
);

router.get(
  "/tickets",
  authenticate,
  authorize("buyer"),
  buyerController.getMyBuyerTickets,
);
router.patch(
  "/tickets/:id",
  authenticate,
  upload.single("attachment"),
  buyerController.updateBuyerTicket,
);

/////////Extra
router.get(
  "/minimal",
  authenticate,
  authorize("buyer"),
  buyerController.getMinimalBuyers,
);
export default router;
