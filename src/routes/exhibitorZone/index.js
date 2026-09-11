const express = require("express");

const router = express.Router();

router.use("/auth", require("./auth"));
router.use("/exhibitors", require("./exhibitors"));
router.use("/documents", require("./documents"));
router.use("/events", require("./events"));
router.use("/stalls", require("./stalls"));
router.use("/catalogue", require("./catalogue"));
router.use("/cart", require("./cart"));
router.use("/orders", require("./orders"));
// Public webhook route mounted first so only "/payments/webhook" bypasses
// auth — every other /payments/* path falls through to the authenticated
// router below (Express tries this one, then continues if nothing matched).
router.use("/payments", require("./paymentsWebhook"));
router.use("/payments", require("./payments"));
router.use("/passes", require("./passes"));
router.use("/forms", require("./forms"));
router.use("/mandatory-forms", require("./mandatoryForms"));
router.use("/notifications", require("./notifications"));
router.use("/admin/dashboard", require("./admin/dashboard"));
router.use("/admin/users", require("./admin/users"));
router.use("/admin/registrations", require("./admin/registrations"));
router.use("/admin/notifications", require("./admin/notifications"));
router.use("/admin/exports", require("./admin/exports"));
router.use("/admin/generated-documents", require("./admin/generatedDocuments"));
router.use("/admin/legacy-import", require("./admin/legacyImport"));

module.exports = router;
