const { ApiError } = require("./errorHandler");

// Only operations/sales accounts are subject to the per-module toggle — every
// other role (super_admin/organiser/finance/exhibitor_*) is unrestricted here,
// gated only by the existing requireRole(...) checks at each route.
const MODULE_GATED_ROLES = ["operations", "sales"];

function hasModuleAccess(req, moduleKey) {
  if (!MODULE_GATED_ROLES.includes(req.user.role)) return true;
  return (req.user.enabledModules || []).includes(moduleKey);
}

function requireModule(moduleKey) {
  return (req, res, next) => {
    if (hasModuleAccess(req, moduleKey)) return next();
    console.warn(`Exhibitor Zone: module check failed — user ${req.user?.id} (${req.user?.role}) tried module "${moduleKey}"`);
    next(new ApiError(403, "Your account does not have access to this module."));
  };
}

module.exports = { requireModule, hasModuleAccess, MODULE_GATED_ROLES };
