const crypto = require("crypto");
const express = require("express");
const pool = require("../../../db/pool");
const asyncHandler = require("../../../middleware/asyncHandler");
const requireAuth = require("../../../middleware/requireAuth");
const requireRole = require("../../../middleware/requireRole");
const requireEventContext = require("../../../middleware/requireEventContext");
const validate = require("../../../middleware/validate");
const { ApiError } = require("../../../middleware/errorHandler");
const { hashPassword } = require("../../../utils/argon");
const { ADMIN_MODULE_KEYS } = require("../../../config/adminModules");
const { z } = require("zod");

const router = express.Router();

const ADMIN_TIER_ROLES = ["super_admin", "organiser", "finance"];
// Operations/sales are restricted admin-tier roles — an admin picks exactly
// which modules each account can reach (see enabled_modules + requireModule).
const RESTRICTED_ROLES = ["operations", "sales"];
const ALL_CREATABLE_ROLES = [...ADMIN_TIER_ROLES, ...RESTRICTED_ROLES];

router.use(requireAuth, requireEventContext, requireRole("super_admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT u.id, u.uuid, u.email, u.first_name, u.last_name, u.is_active, u.last_login_at, r.name AS role,
              uer.enabled_modules
       FROM users u
       JOIN user_event_roles uer ON uer.user_id = u.id
       JOIN roles r ON r.id = uer.role_id
       WHERE uer.is_active = 1 AND r.name IN ('super_admin', 'organiser', 'finance', 'operations', 'sales')
         AND (r.name = 'super_admin' OR uer.event_id = ?)
       GROUP BY u.id, r.name
       ORDER BY u.created_at DESC`,
      [req.user.eventId]
    );
    res.json({
      users: rows.map((u) => ({ ...u, enabled_modules: u.enabled_modules ? JSON.parse(u.enabled_modules) : [] })),
      availableModules: ADMIN_MODULE_KEYS
    });
  })
);

const createUserSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(ALL_CREATABLE_ROLES),
  enabledModules: z.array(z.enum(ADMIN_MODULE_KEYS)).optional()
});

router.post(
  "/",
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [b.email]);
    if (existing.length > 0) throw new ApiError(409, "An account with this email already exists.");

    const [roleRows] = await pool.query("SELECT id FROM roles WHERE name = ? LIMIT 1", [b.role]);
    if (roleRows.length === 0) throw new ApiError(500, "Server misconfiguration: role not found.");

    // Only operations/sales are ever module-gated (see requireModule) — the
    // toggle is meaningless, so ignored, for every other role.
    const enabledModules = RESTRICTED_ROLES.includes(b.role) ? b.enabledModules || [] : null;

    const passwordHash = await hashPassword(b.password);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [userResult] = await connection.query(
        `INSERT INTO users (uuid, email, password_hash, first_name, last_name, timezone, locale, login_attempts, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'Asia/Kolkata', 'en-IN', 0, 1, NOW(), NOW())`,
        [crypto.randomUUID(), b.email, passwordHash, b.firstName, b.lastName]
      );

      await connection.query(
        `INSERT INTO user_event_roles (user_id, event_id, role_id, granted_by, granted_at, is_active, enabled_modules, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), 1, ?, NOW(), NOW())`,
        [userResult.insertId, req.user.eventId, roleRows[0].id, req.user.id, enabledModules ? JSON.stringify(enabledModules) : null]
      );

      await connection.commit();
      res.status(201).json({ message: "User created.", userId: userResult.insertId });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  })
);

const updateStatusSchema = z.object({ isActive: z.coerce.boolean() });

router.patch(
  "/:id/status",
  validate(updateStatusSchema),
  asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.user.id) throw new ApiError(400, "You cannot change your own account status.");

    const [result] = await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [
      req.body.isActive ? 1 : 0,
      req.params.id
    ]);
    if (result.affectedRows === 0) throw new ApiError(404, "User not found.");
    res.json({ message: "User status updated." });
  })
);

const updateRoleSchema = z.object({ role: z.enum(ALL_CREATABLE_ROLES) });

router.patch(
  "/:id/role",
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const [roleRows] = await pool.query("SELECT id FROM roles WHERE name = ? LIMIT 1", [req.body.role]);
    if (roleRows.length === 0) throw new ApiError(500, "Server misconfiguration: role not found.");

    const [grantRows] = await pool.query(
      "SELECT id FROM user_event_roles WHERE user_id = ? AND event_id = ? AND is_active = 1 LIMIT 1",
      [req.params.id, req.user.eventId]
    );
    if (grantRows.length === 0) throw new ApiError(404, "This user has no active grant for the active event.");

    // Switching away from operations/sales clears any previously granted
    // module list — it's meaningless (and unenforced) for every other role.
    const enabledModules = RESTRICTED_ROLES.includes(req.body.role) ? undefined : null;

    await pool.query(
      `UPDATE user_event_roles SET role_id = ?, updated_at = NOW()${enabledModules === null ? ", enabled_modules = NULL" : ""} WHERE id = ?`,
      [roleRows[0].id, grantRows[0].id]
    );
    res.json({ message: "User role updated." });
  })
);

const updateModulesSchema = z.object({ enabledModules: z.array(z.enum(ADMIN_MODULE_KEYS)) });

router.patch(
  "/:id/modules",
  validate(updateModulesSchema),
  asyncHandler(async (req, res) => {
    const [grantRows] = await pool.query(
      `SELECT uer.id, r.name AS role_name FROM user_event_roles uer
       JOIN roles r ON r.id = uer.role_id
       WHERE uer.user_id = ? AND uer.event_id = ? AND uer.is_active = 1 LIMIT 1`,
      [req.params.id, req.user.eventId]
    );
    if (grantRows.length === 0) throw new ApiError(404, "This user has no active grant for the active event.");
    if (!RESTRICTED_ROLES.includes(grantRows[0].role_name)) {
      throw new ApiError(400, "Only Operations and Sales accounts have per-module access — every other role already has full access.");
    }

    await pool.query("UPDATE user_event_roles SET enabled_modules = ?, updated_at = NOW() WHERE id = ?", [
      JSON.stringify(req.body.enabledModules),
      grantRows[0].id
    ]);
    res.json({ message: "Module access updated." });
  })
);

module.exports = router;
