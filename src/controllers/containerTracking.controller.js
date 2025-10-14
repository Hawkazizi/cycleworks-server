import * as trackingService from "../services/containerTracking.service.js";
import db from "../db/knex.js";

////////////Admin privileges ////////////////////////

export async function listAllContainersWithTracking(req, res) {
  try {
    const rows = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .leftJoin("users as u", "p.farmer_id", "u.id")
      .leftJoin("user_applications as ua", "ua.user_id", "u.id") // ✅ supplier name
      .leftJoin("buyer_requests as br", "p.request_id", "br.id")
      .leftJoin(
        db("container_tracking_statuses as t")
          .select("container_id")
          .max("created_at as latest_time")
          .groupBy("container_id")
          .as("last"),
        "c.id",
        "last.container_id"
      )
      .leftJoin("container_tracking_statuses as ct", function () {
        this.on("ct.container_id", "=", "c.id").andOn(
          "ct.created_at",
          "=",
          "last.latest_time"
        );
      })
      .select(
        "c.id as container_id",
        "c.container_no",
        "p.request_id as buyer_request_id",
        "u.id as farmer_id",
        "u.name as farmer_name",
        "ua.supplier_name", // ✅ added field
        "br.import_country",
        "ct.status as latest_status",
        "ct.note",
        "ct.created_at as updated_at"
      )
      .orderBy("ct.created_at", "desc");

    res.json(rows);
  } catch (err) {
    console.error("listAllContainersWithTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

////////////////////////
export async function addTracking(req, res) {
  try {
    const { id } = req.params; // container id
    const { status, note } = req.body;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    // 🧩 Check ownership or admin privilege
    if (!roles.includes("admin")) {
      const ownsContainer = await db("farmer_plan_containers")
        .join(
          "farmer_plans",
          "farmer_plan_containers.plan_id",
          "farmer_plans.id"
        )
        .where("farmer_plans.farmer_id", userId)
        .andWhere("farmer_plan_containers.id", id)
        .first();

      if (!ownsContainer) {
        return res.status(403).json({ error: "You do not own this container" });
      }
    }

    const tracking = await trackingService.addTracking({
      containerId: id,
      status,
      note,
      createdBy: userId,
    });

    res.json(tracking);
  } catch (err) {
    console.error("Add tracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/containers/:id/tracking
export async function listTracking(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    // 🧩 Only admin or owner can view
    if (!roles.includes("admin")) {
      const ownsContainer = await db("farmer_plan_containers")
        .join(
          "farmer_plans",
          "farmer_plan_containers.plan_id",
          "farmer_plans.id"
        )
        .where("farmer_plans.farmer_id", userId)
        .andWhere("farmer_plan_containers.id", id)
        .first();

      if (!ownsContainer) {
        return res.status(403).json({ error: "You do not own this container" });
      }
    }

    const items = await trackingService.listTracking(id);
    res.json(items);
  } catch (err) {
    console.error("List tracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function myContainersWithTracking(req, res) {
  try {
    const userId = req.user.id;

    const rows = await db("farmer_plan_containers as c")
      .join("farmer_plans as p", "c.plan_id", "p.id")
      .join("buyer_requests as br", "p.request_id", "br.id")
      .leftJoin(
        db("container_tracking_statuses as t")
          .select("container_id")
          .max("created_at as latest_time")
          .groupBy("container_id")
          .as("last"),
        "c.id",
        "last.container_id"
      )
      .leftJoin("container_tracking_statuses as ct", function () {
        this.on("ct.container_id", "=", "c.id").andOn(
          "ct.created_at",
          "=",
          "last.latest_time"
        );
      })
      .where("p.farmer_id", userId)
      .select(
        "c.id as container_id",
        "p.request_id as buyer_request_id",
        "c.container_no",
        "br.import_country",
        "ct.status as latest_status",
        "ct.created_at as updated_at"
      )
      .orderBy("ct.created_at", "desc");

    res.json(rows);
  } catch (err) {
    console.error("myContainersWithTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}
