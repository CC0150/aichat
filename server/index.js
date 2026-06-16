const path = require("path");
const dotenv = require("dotenv");
const express = require("express");

// 加载 server/.env 环境变量
dotenv.config({ path: path.resolve(__dirname, ".env") });

const { PORT, API_KEY } = require("./config");
const { setupMiddleware, setupErrorHandler } = require("./middleware");
const { setupRoutes } = require("./routes");

if (!API_KEY) {
  console.warn(
    "[server] 未检测到 DEEPSEEK_API_KEY，请在 server/.env 中配置：DEEPSEEK_API_KEY=sk-xxx"
  );
}

const app = express();

// 中间件
setupMiddleware(app);

// 路由
setupRoutes(app);

// 全局错误处理（必须在路由之后注册）
setupErrorHandler(app);

app.listen(PORT, () => {
  console.log(`[server] Chat proxy listening on http://localhost:${PORT}`);
});
