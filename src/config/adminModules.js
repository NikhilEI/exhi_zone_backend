// Canonical list of admin modules that a restricted "operations"/"sales"
// account can be granted, one-by-one, via user_event_roles.enabled_modules.
// Every other role (super_admin/organiser/finance) always has full access
// regardless of this list — see middleware/requireModule.js. Keys must stay
// in sync with the moduleKey values passed to requireModule(...) at each
// route's gate and with ADMIN_MODULE_KEYS on the frontend admin/users page.
const ADMIN_MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "events", label: "Events" },
  { key: "registrations", label: "Registrations" },
  { key: "companies", label: "Exhibitor CRM" },
  { key: "exhibitor-progress", label: "Exhibitor Progress" },
  { key: "stalls", label: "Stall Grid" },
  { key: "catalogue", label: "Service Catalogue" },
  { key: "carts", label: "Carts" },
  { key: "orders", label: "Orders & Invoices" },
  { key: "payments", label: "Payments" },
  { key: "passes", label: "Pass Management" },
  { key: "mandatory-forms", label: "Mandatory Forms" },
  { key: "services", label: "Additional Requirements" },
  { key: "forms", label: "Form Reviews" },
  { key: "documents", label: "Exhibitor Documents" },
  { key: "notifications", label: "Send Notification" },
  { key: "exports", label: "Export Data" }
];

const ADMIN_MODULE_KEYS = ADMIN_MODULES.map((m) => m.key);

module.exports = { ADMIN_MODULES, ADMIN_MODULE_KEYS };
