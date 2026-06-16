const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

/**
 * 注册全局中间件
 */
function setupMiddleware(app) {
  app.use(compression());

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://api.iconify.design"],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        scriptSrc: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
      },
    },
  }));

  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  app.use(express.json({ limit: "5mb" }));

  // API 速率限制：防止 API 额度被滥用
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 分钟窗口
    max: 30, // 每分钟最多 30 次请求
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "请求过于频繁，请稍后再试" },
  });
  app.use("/api", apiLimiter);
}

/**
 * 全局错误处理中间件 — 捕获未处理的异常，防止进程崩溃
 */
function setupErrorHandler(app) {
  app.use((err, _req, res, _next) => {
    console.error("[server] 未捕获错误:", err.message)
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === "production"
        ? "服务器内部错误"
        : err.message || "未知错误",
    })
  })
}

/**
 * 为 SSE 响应写入标准头 + 防缓冲填充
 */
function writeSSEHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  // 防缓冲填充
  res.write(": " + " ".repeat(2048) + "\n\n");
}

module.exports = { setupMiddleware, setupErrorHandler, writeSSEHeaders };
