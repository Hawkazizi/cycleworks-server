import * as trackingService from "../services/containerTracking.service.js";
import db from "../db/knex.js";

/* =======================================================================
   📦 CONTAINER OVERVIEW (ADMIN)
======================================================================= */
/** 🧾 List all containers with latest tracking, plans, files, and stats */
/** 🧾 List all containers with latest tracking, plans, files, and stats */
export async function listAllContainersWithTracking(req, res) {
  try {
    const rows = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
      // 🟢 supplier & buyer joins
      .leftJoin("users as supplier", "c.supplier_id", "supplier.id")
      .leftJoin("buyer_requests as br", "p.request_id", "br.id")
      .leftJoin("users as buyer", "br.buyer_id", "buyer.id")
      // 🟢 latest tracking join
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
      // ❌ REMOVED – this was hiding all in-progress containers
      // .whereRaw(`c.metadata->>'ty_number' IS NOT NULL AND c.metadata->>'ty_number' <> ''`)
      .select(
        "c.id as container_id",
        "c.container_no",
        "c.status as container_status",

        // ✅ added fields
        "c.in_progress",
        "c.is_completed",

        "c.created_at as container_created_at",
        "c.metadata",
        "c.metadata_status",
        "c.metadata_review_note",
        "c.admin_metadata",
        "c.admin_metadata_status",
        "c.admin_metadata_review_note",

        // Plan
        "p.id as plan_id",
        "p.plan_date",
        "p.status as plan_status",

        // Buyer request
        "br.id as buyer_request_id",
        "br.import_country",
        "br.entry_border",
        "br.exit_border",
        "br.transport_type",
        "br.product_type",
        "br.packaging",
        "br.egg_type",
        "br.container_amount",
        "br.cartons",
        "br.status as buyer_status",

        // Users (supplier / buyer)
        "supplier.id as supplier_id",
        "supplier.name as supplier_name",
        "supplier.email as supplier_email",
        "buyer.id as buyer_id",
        "buyer.name as buyer_name",
        "buyer.email as buyer_email",

        // Latest tracking
        "ct.status as latest_status",
        "ct.note",
        "ct.tracking_code",
        "ct.created_at as updated_at",
      )
      .orderBy("ct.created_at", "desc");

    // 🔹 Handle no results
    if (!rows.length) {
      return res.json({
        stats: { totalContainers: 0, containersByCountry: {}, exitedIran: 0 },
        containers: [],
      });
    }

    // 🧩 Optional filter by supplier_id query param
    const { supplier_id } = req.query;
    const filteredRows = supplier_id
      ? rows.filter((r) => String(r.supplier_id) === String(supplier_id))
      : rows;

    const containerIds = filteredRows.map((r) => r.container_id);

    // 🧾 Fetch all tracking history for visible containers
    const histories = await db("container_tracking_statuses")
      .whereIn("container_id", containerIds)
      .orderBy("created_at", "desc");

    const historyByContainer = histories.reduce((acc, h) => {
      (acc[h.container_id] ||= []).push(h);
      return acc;
    }, {});

    // 📂 Fetch files per container
    const files = await db("farmer_plan_files")
      .whereIn("container_id", containerIds)
      .select(
        "id",
        "container_id",
        "original_name",
        "mime_type",
        "path",
        "size_bytes",
        "status",
        "type",
        "created_at",
      );

    const filesByContainer = files.reduce((acc, f) => {
      (acc[f.container_id] ||= []).push(f);
      return acc;
    }, {});

    // 🧠 Safe JSON parse helper
    function safeParseJSON(value) {
      try {
        return value ? JSON.parse(value) : {};
      } catch {
        return {};
      }
    }

    // 🧩 Merge everything together
    const containers = filteredRows.map((c) => ({
      ...c,
      metadata:
        typeof c.metadata === "string"
          ? safeParseJSON(c.metadata)
          : c.metadata || {},
      admin_metadata:
        typeof c.admin_metadata === "string"
          ? safeParseJSON(c.admin_metadata)
          : c.admin_metadata || {},
      tracking_history: historyByContainer[c.container_id] || [],
      files: filesByContainer[c.container_id] || [],
    }));

    // 📊 Compute stats
    const containersByCountry = {};
    let exitedIran = 0;
    containers.forEach((c) => {
      const country = c.import_country?.trim() || "Unknown";
      containersByCountry[country] = (containersByCountry[country] || 0) + 1;
      if (c.is_completed) exitedIran++;
    });

    // ✅ Response
    res.json({
      stats: {
        totalContainers: containers.length,
        containersByCountry,
        exitedIran,
      },
      containers,
    });
  } catch (err) {
    console.error("listAllContainersWithTracking error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
}

/** 📂 Get all files of a container */
export async function getContainerFiles(req, res) {
  try {
    const { id } = req.params;
    const files = await db("farmer_plan_files")
      .where({ container_id: id })
      .select(
        "id",
        "container_id",
        "original_name",
        "mime_type",
        "path",
        "size_bytes",
        "status",
        "type",
        "created_at",
      )
      .orderBy("created_at", "desc");

    res.json({ files });
  } catch (err) {
    console.error("getContainerFiles error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* =======================================================================
   🧭 TRACKING OPERATIONS
======================================================================= */

/** ➕ Add Tracking (Controller) */
export async function addTracking(req, res) {
  try {
    const { id } = req.params;
    const { status, tracking_code, note } = req.body;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    if (!status) return res.status(400).json({ error: "Status is required" });

    // Ownership check for non-admins
    if (!roles.includes("admin") && !roles.includes("manager")) {
      const owns = await db("farmer_plan_containers as c")
        .where((builder) => {
          builder.where("c.supplier_id", userId);
        })
        .andWhere("c.id", id)
        .first();

      if (!owns) return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await trackingService.addTracking(
      id,
      userId,
      status,
      tracking_code,
      note,
    );
    res.json(result);
  } catch (err) {
    console.error("addTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/** 📜 List all tracking records for a container */
export async function listTracking(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    // Access control
    if (!roles.includes("admin") && !roles.includes("manager")) {
      const ownsContainer = await db("farmer_plan_containers as c")
        .where((builder) => {
          builder.where("c.supplier_id", userId);
        })
        .andWhere("c.id", id)
        .first();

      if (!ownsContainer)
        return res.status(403).json({ error: "You do not own this container" });
    }

    const items = await trackingService.listTracking(id);
    res.json(items);
  } catch (err) {
    console.error("listTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* =======================================================================
   👤 USER: MY CONTAINERS
======================================================================= */
/** 📦 List current supplier's containers with tracking & files */
export async function myContainersWithTracking(req, res) {
  try {
    const userId = req.user.id;

    const rows = await db("farmer_plan_containers as c")
      .leftJoin("farmer_plans as p", "c.plan_id", "p.id")
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
      .where("c.supplier_id", userId)
      .select(
        "c.id as container_id",
        "c.container_no",
        "c.status as container_status",
        "c.farmer_status", // 🟢 include farmer status
        "c.in_progress",
        "c.tracking_code",
        "c.updated_at",
        "c.in_progress",
        "c.is_completed",
        "c.in_progress",
        "c.metadata",
        "c.metadata_status",
        "c.metadata_review_note",
        "p.plan_date",
        "p.id as plan_id",
        "p.request_id as buyer_request_id",
        "br.import_country",
        "br.entry_border",
        "br.exit_border",
        "br.transport_type",
        "br.product_type",
        "br.packaging",
        "br.egg_type",
        "br.container_amount",
        "br.cartons",
        "ct.status as latest_status",
        "ct.tracking_code as latest_tracking_code",
        "ct.created_at as tracking_updated_at",
      )
      .orderBy("ct.created_at", "desc");

    const containers = await Promise.all(
      rows.map(async (c) => {
        const files = await db("farmer_plan_files")
          .where("container_id", c.container_id)
          .select(
            "id",
            "type",
            "original_name",
            "path",
            "mime_type",
            "size_bytes",
            "status",
            "created_at",
          )
          .orderBy("created_at", "desc");

        let metadata = {};
        try {
          metadata =
            typeof c.metadata === "string"
              ? JSON.parse(c.metadata)
              : c.metadata || {};
        } catch {
          metadata = {};
        }

        // 🧩 Status priority logic
        let finalStatus = "submitted";
        if (c.is_completed) finalStatus = "completed";
        else if (
          c.farmer_status?.toLowerCase() === "rejected" ||
          c.container_status?.toLowerCase() === "rejected"
        )
          finalStatus = "rejected";
        else if (c.in_progress) finalStatus = "in_progress";
        else if (c.latest_status) finalStatus = c.latest_status.toLowerCase();
        else if (c.container_status)
          finalStatus = c.container_status.toLowerCase();

        return {
          container_id: c.container_id,
          container_no: c.container_no,
          plan_id: c.plan_id,
          buyer_request_id: c.buyer_request_id,
          import_country: c.import_country,
          tracking_code: c.tracking_code || c.latest_tracking_code,
          status: finalStatus,
          plan_date: c.plan_date,
          updated_at: c.tracking_updated_at || c.updated_at,
          is_completed: !!c.is_completed,
          in_progress: !!c.in_progress,
          farmer_status: c.farmer_status || null,
          container_status: c.container_status || null,
          metadata,
          metadata_status: c.metadata_status,
          metadata_review_note: c.metadata_review_note,
          files,
        };
      }),
    );

    res.json(containers);
  } catch (err) {
    console.error("myContainersWithTracking error:", err);
    res.status(500).json({ error: err.message });
  }
}

/* =======================================================================
   🔎 ADMIN LOOKUP BY TRACKING CODE
======================================================================= */

/** 🔍 Find container by tracking code */
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

/* =======================================================================
   🔠 TY NUMBER MANAGEMENT
======================================================================= */

/** ✏️ Update TY (Tracking) Number (Controller) */
export async function updateTyNumber(req, res) {
  try {
    const { id } = req.params;
    const { ty_number } = req.body;
    const userId = req.user.id;
    const roles = req.user.roles || [];

    if (!ty_number)
      return res.status(400).json({ error: "TY number is required" });

    // Ownership check for non-admins
    if (!roles.includes("admin") && !roles.includes("manager")) {
      const owns = await db("farmer_plan_containers as c")
        .where((builder) => {
          builder.where("c.supplier_id", userId);
        })
        .andWhere("c.id", id)
        .first();

      if (!owns) return res.status(403).json({ error: "Unauthorized" });
    }

    const result = await trackingService.updateTyNumber(id, ty_number, userId);
    res.json(result);
  } catch (err) {
    console.error("updateTyNumber error:", err);
    res.status(500).json({ error: err.message });
  }
}
