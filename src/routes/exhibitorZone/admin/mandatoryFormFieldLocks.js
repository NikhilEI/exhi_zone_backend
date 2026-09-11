const express = require("express");
const pool = require("../../../db/pool");
const asyncHandler = require("../../../middleware/asyncHandler");
const requireAuth = require("../../../middleware/requireAuth");
const requireRole = require("../../../middleware/requireRole");
const requireEventContext = require("../../../middleware/requireEventContext");
const { requireModule } = require("../../../middleware/requireModule");
const { ApiError } = require("../../../middleware/errorHandler");
const { MANDATORY_FORM_FIELDS, getFormFields } = require("../../../config/mandatoryFormFields");
const { z } = require("zod");

const router = express.Router();

const ADMIN_ROLES = ["super_admin", "organiser", "operations", "sales"];
// Reserved sentinel row for "this lock applies to every exhibitor" — see
// mandatory_form_field_locks in schema.sql for why 0 instead of NULL.
const GLOBAL_SENTINEL = 0;

router.use(requireAuth, requireEventContext, requireRole(...ADMIN_ROLES), requireModule("mandatory-form-locks"));

function requireValidFormKey(formKey) {
  const fields = getFormFields(formKey);
  if (!fields) throw new ApiError(400, "Unknown form key.");
  return fields;
}

// Best-effort human-readable snapshot of an exhibitor's current values for
// one form, purely for display in the lock-toggle UI — not used for any
// enforcement decision.
async function getFormValues(pool, { profileId, eventId, formKey }) {
  switch (formKey) {
    case "exhibitor-information": {
      const [rows] = await pool.query(
        "SELECT * FROM exhibitor_directory_info WHERE exhibitor_profile_id = ? AND event_id = ? LIMIT 1",
        [profileId, eventId]
      );
      return rows[0] || {};
    }
    case "product-information": {
      const [rows] = await pool.query(
        "SELECT COUNT(*) AS count FROM exhibitor_product_categories WHERE exhibitor_profile_id = ? AND event_id = ?",
        [profileId, eventId]
      );
      return { selections: `${rows[0].count} categor${rows[0].count === 1 ? "y" : "ies"} selected` };
    }
    case "booth-design-submission":
    case "fascia-name-submission": {
      const [rows] = await pool.query(
        `SELECT fs.data FROM form_submissions fs
         JOIN form_templates ft ON ft.id = fs.form_template_id
         WHERE ft.slug = ? AND ft.event_id = ? AND fs.exhibitor_profile_id = ?
         ORDER BY fs.created_at DESC LIMIT 1`,
        [formKey, eventId, profileId]
      );
      return rows[0] ? JSON.parse(rows[0].data) : {};
    }
    case "sound-noise-guidelines": {
      const [rows] = await pool.query(
        "SELECT acknowledged FROM sound_noise_guideline_acknowledgement WHERE exhibitor_profile_id = ? AND event_id = ? LIMIT 1",
        [profileId, eventId]
      );
      return { acknowledged: rows[0] ? !!rows[0].acknowledged : false };
    }
    case "principal-agent-information": {
      const [countRows] = await pool.query(
        "SELECT COUNT(*) AS count FROM principal_agent_records WHERE exhibitor_profile_id = ? AND event_id = ?",
        [profileId, eventId]
      );
      const [metaRows] = await pool.query(
        "SELECT no_principal_agent FROM principal_agent_meta WHERE exhibitor_profile_id = ? AND event_id = ? LIMIT 1",
        [profileId, eventId]
      );
      return {
        declaration: metaRows[0] ? !!metaRows[0].no_principal_agent : false,
        records: `${countRows[0].count} record(s)`
      };
    }
    case "badges-for-exhibitors": {
      const [rows] = await pool.query(
        "SELECT COUNT(*) AS count FROM badge_records WHERE exhibitor_profile_id = ? AND event_id = ?",
        [profileId, eventId]
      );
      return { records: `${rows[0].count} badge(s)` };
    }
    default:
      return {};
  }
}

async function replaceLockSet(connection, { eventId, exhibitorProfileId, formKey, fieldKeys, userId }) {
  await connection.query(
    "DELETE FROM mandatory_form_field_locks WHERE event_id = ? AND exhibitor_profile_id = ? AND form_key = ?",
    [eventId, exhibitorProfileId, formKey]
  );
  if (fieldKeys.length === 0) return;
  const values = fieldKeys.map((fieldKey) => [eventId, exhibitorProfileId, formKey, fieldKey, userId, new Date()]);
  await connection.query(
    "INSERT INTO mandatory_form_field_locks (event_id, exhibitor_profile_id, form_key, field_key, locked_by, locked_at) VALUES ?",
    [values]
  );
}

router.get(
  "/forms",
  asyncHandler(async (req, res) => {
    res.json({ forms: Object.keys(MANDATORY_FORM_FIELDS) });
  })
);

router.get(
  "/fields",
  asyncHandler(async (req, res) => {
    const fields = requireValidFormKey(req.query.formKey);
    res.json({ fields });
  })
);

router.get(
  "/global",
  asyncHandler(async (req, res) => {
    requireValidFormKey(req.query.formKey);
    const [rows] = await pool.query(
      "SELECT field_key FROM mandatory_form_field_locks WHERE event_id = ? AND exhibitor_profile_id = ? AND form_key = ?",
      [req.user.eventId, GLOBAL_SENTINEL, req.query.formKey]
    );
    res.json({ lockedFieldKeys: rows.map((r) => r.field_key) });
  })
);

const setLocksSchema = z.object({
  formKey: z.string(),
  lockedFieldKeys: z.array(z.string())
});

router.put(
  "/global",
  asyncHandler(async (req, res) => {
    const parsed = setLocksSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Please check the highlighted fields.");
    const fields = requireValidFormKey(parsed.data.formKey);
    const validKeys = new Set(fields.map((f) => f.key));
    const fieldKeys = parsed.data.lockedFieldKeys.filter((k) => validKeys.has(k));

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await replaceLockSet(connection, {
        eventId: req.user.eventId,
        exhibitorProfileId: GLOBAL_SENTINEL,
        formKey: parsed.data.formKey,
        fieldKeys,
        userId: req.user.id
      });
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({ message: "Global lock updated." });
  })
);

router.get(
  "/:exhibitorProfileId",
  asyncHandler(async (req, res) => {
    const fields = requireValidFormKey(req.query.formKey);
    const profileId = Number(req.params.exhibitorProfileId);

    const [profileRows] = await pool.query(
      `SELECT eep.id, c.display_name FROM exhibitor_event_profiles eep
       JOIN companies c ON c.id = eep.company_id
       WHERE eep.id = ? AND eep.event_id = ? LIMIT 1`,
      [profileId, req.user.eventId]
    );
    if (profileRows.length === 0) throw new ApiError(404, "Exhibitor profile not found for the active event.");

    const [rows] = await pool.query(
      "SELECT field_key, exhibitor_profile_id FROM mandatory_form_field_locks WHERE event_id = ? AND form_key = ? AND exhibitor_profile_id IN (?, ?)",
      [req.user.eventId, req.query.formKey, profileId, GLOBAL_SENTINEL]
    );
    const global = rows.filter((r) => Number(r.exhibitor_profile_id) === GLOBAL_SENTINEL).map((r) => r.field_key);
    const exhibitor = rows.filter((r) => Number(r.exhibitor_profile_id) !== GLOBAL_SENTINEL).map((r) => r.field_key);

    const values = await getFormValues(pool, { profileId, eventId: req.user.eventId, formKey: req.query.formKey });

    res.json({
      companyName: profileRows[0].display_name,
      fields,
      values,
      locked: { global, exhibitor }
    });
  })
);

router.put(
  "/:exhibitorProfileId",
  asyncHandler(async (req, res) => {
    const parsed = setLocksSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "Please check the highlighted fields.");
    const fields = requireValidFormKey(parsed.data.formKey);
    const validKeys = new Set(fields.map((f) => f.key));
    const fieldKeys = parsed.data.lockedFieldKeys.filter((k) => validKeys.has(k));
    const profileId = Number(req.params.exhibitorProfileId);

    const [profileRows] = await pool.query(
      "SELECT id FROM exhibitor_event_profiles WHERE id = ? AND event_id = ? LIMIT 1",
      [profileId, req.user.eventId]
    );
    if (profileRows.length === 0) throw new ApiError(404, "Exhibitor profile not found for the active event.");

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await replaceLockSet(connection, {
        eventId: req.user.eventId,
        exhibitorProfileId: profileId,
        formKey: parsed.data.formKey,
        fieldKeys,
        userId: req.user.id
      });
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({ message: "Lock updated." });
  })
);

module.exports = router;
