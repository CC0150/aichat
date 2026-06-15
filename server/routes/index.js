const chatRouter = require("./chat");
const interviewRouter = require("./interview");
const questionsRouter = require("./questions");
const knowledgeRouter = require("./knowledge");
const healthRouter = require("./health");

/**
 * 注册所有路由
 */
function setupRoutes(app) {
  app.use("/api/chat", chatRouter);
  app.use("/api/interview", interviewRouter);
  app.use("/api/questions", questionsRouter);
  app.use("/api/knowledge", knowledgeRouter);
  app.use("/health", healthRouter);
}

module.exports = { setupRoutes };
