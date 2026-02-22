import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import upload from "../middleware/upload.js";
import * as ticketController from "../controllers/ticket.controller.js";

const router = express.Router();

// ✅ STATIC routes first
router.get("/recipients", authenticate, ticketController.listRecipients);

// Create ticket
router.post(
  "/",
  authenticate,
  upload.single("attachment"),
  ticketController.createTicket,
);

// List my tickets (for EVERYONE — including admin/manager)
router.get("/", authenticate, ticketController.listMyTickets);

// ❌ REMOVE THIS or keep but DON'T use it
// router.get("/admin", authenticate, authorize("admin", "manager"), ticketController.listAllTickets);

// Get thread
router.get("/:id", authenticate, ticketController.getTicketThread);

// Reply
router.post(
  "/:id/replies",
  authenticate,
  upload.single("attachment"),
  ticketController.replyToTicket,
);

// Update (creator only)
router.patch(
  "/:id",
  authenticate,
  upload.single("attachment"),
  ticketController.updateTicket,
);

// Close
router.patch("/:id/close", authenticate, ticketController.closeTicket);

// Delete (admin/manager only)
router.delete(
  "/:id",
  authenticate,
  authorize("admin", "manager"),
  ticketController.deleteTicket,
);

export default router;
