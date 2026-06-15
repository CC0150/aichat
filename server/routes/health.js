const { Router } = require("express");

const router = Router();

/**
 * GET /health
 * 健康检查
 */
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

module.exports = router;
