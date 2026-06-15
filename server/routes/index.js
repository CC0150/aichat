const chatRouter = require("./chat");
const healthRouter = require("./health");

/**
 * 注册所有路由
 */
function setupRoutes(app) {
  app.use("/api/chat", chatRouter);
  app.use("/health", healthRouter);
}

module.exports = { setupRoutes };
