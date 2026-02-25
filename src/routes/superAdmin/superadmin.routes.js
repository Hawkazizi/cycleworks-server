import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import * as superAdminController from "../../controllers/superAdmin/superAdmin.controller.js";

const router = Router();

router.post("/login", superAdminController.login);

// everything below requires super_admin
router.use(authenticate);
router.use(authorize("super_admin"));

router.get("/me", superAdminController.me);

// add dangerous routes here later
// router.get("/tickets/all", superAdminController.listAllTickets);

export default router;
