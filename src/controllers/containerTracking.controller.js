import * as trackingService from "../services/containerTracking.service.js";
import db from "../db/knex.js";
/* -------------------- ADMIN: List all containers with their latest tracking -------------------- */
export async function listAllContainersWithTracking(req, res) {
  try {
    const rows = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      .leftJoin("users as u", "p.farmer_id", "u.id")
      .leftJoin("user_applications as ua", "ua.user_id", "u.id")
      .leftJoin("buyer_requests as br", "p.request_id", "br.id")
      .leftJoin(
        db("container_tracking_statuses as t")
          .select("container_id")
          .max("created_at as latest_time")
          .groupBy("container_id")
          .as("last"),
        "c.id",
        "last.container_id",
      )
      .leftJoin("container_tracking_statuses as ct", function () {
        this.on("ct.container_id", "=", "c.id").andOn(
          "ct.created_at",
          "=",
          "last.latest_time",
        );
      })
      .select(
        "c.id as container_id",
        "c.container_no",
        "c.created_at as container_created_at", // ✅ new
        "p.plan_date", // ✅ new
        "p.created_at as plan_created_at", // ✅ new
        "p.request_id as buyer_request_id",
        "br.created_at as request_created_at", // ✅ new
        "u.id as farmer_id",
        "u.name as farmer_name",
        "ua.supplier_name",
        "br.import_country",
        "ct.status as latest_status",
        "ct.note",
        "ct.tracking_code",
        "ct.created_at as updated_at",
      )
      .orderBy("ct.created_at", "desc");

    // ✅ Optional: filter by supplier if provided (for your SupplierDetails.jsx)
    const { supplier_id } = req.query;
    const filteredRows = supplier_id
      ? rows.filter((r) => String(r.farmer_id) === String(supplier_id))
      : rows;

    res.json(filteredRows);
  } catch (err) {
    console.error("listAllContainersWithTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* -------------------- USER/ADMIN: Add new tracking status -------------------- */
export async function addTracking(req, res) {
  try {
    const { id } = req.params; // container id
    const { status, note, tracking_code } = req.body;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    // 🧩 Check ownership or admin privilege
    if (!roles.includes("admin") && !roles.includes("manager")) {
      const ownsContainer = await db("farmer_plan_containers")
        .join(
          "farmer_plans",
          "farmer_plan_containers.plan_id",
          "farmer_plans.id",
        )
        .where("farmer_plans.farmer_id", userId)
        .andWhere("farmer_plan_containers.id", id)
        .first();

      if (!ownsContainer)
        return res.status(403).json({ error: "You do not own this container" });
    }

    const tracking = await trackingService.addTracking({
      containerId: id,
      status,
      note,
      tracking_code,
      createdBy: userId,
    });

    res.json(tracking);
  } catch (err) {
    console.error("Add tracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* -------------------- USER/ADMIN: List tracking history of one container -------------------- */
export async function listTracking(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    if (!roles.includes("admin") && !roles.includes("manager")) {
      const ownsContainer = await db("farmer_plan_containers")
        .join(
          "farmer_plans",
          "farmer_plan_containers.plan_id",
          "farmer_plans.id",
        )
        .where("farmer_plans.farmer_id", userId)
        .andWhere("farmer_plan_containers.id", id)
        .first();

      if (!ownsContainer)
        return res.status(403).json({ error: "You do not own this container" });
    }

    const items = await trackingService.listTracking(id);
    res.json(items);
  } catch (err) {
    console.error("List tracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* -------------------- USER: List my containers with latest tracking + files -------------------- */
export async function myContainersWithTracking(req, res) {
  try {
    const userId = req.user.id;

    // Step 1: fetch containers + latest tracking info
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
        "last.container_id",
      )
      .leftJoin("container_tracking_statuses as ct", function () {
        this.on("ct.container_id", "=", "c.id").andOn(
          "ct.created_at",
          "=",
          "last.latest_time",
        );
      })
      .where("p.farmer_id", userId)
      .select(
        "c.id as container_id",
        "p.request_id as buyer_request_id",
        "c.container_no",
        "br.import_country",
        "ct.status as latest_status",
        "ct.tracking_code",
        "ct.created_at as updated_at",
      )
      .orderBy("ct.created_at", "desc");

    // Step 2: fetch related files for each container
    const containersWithFiles = await Promise.all(
      rows.map(async (c) => {
        const files = await db("farmer_plan_files")
          .where("container_id", c.container_id)
          .select(
            "id",
            "type",
            "original_name",
            "path",
            "status",
            "review_note",
            "created_at",
          )
          .orderBy("created_at", "desc");

        return { ...c, files };
      }),
    );

    res.json(containersWithFiles);
  } catch (err) {
    console.error("myContainersWithTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* -------------------- ADMIN: Find container by tracking code -------------------- */
export async function findByTrackingCode(req, res) {
  try {
    const { code } = req.params;
    const record = await trackingService.findByTrackingCode(code);
    if (!record)
      return res.status(404).json({ error: "Tracking code not found" });
    res.json(record);
  } catch (err) {
    console.error("findByTrackingCode error:", err);
    res.status(500).json({ error: err.message });
  }
}
