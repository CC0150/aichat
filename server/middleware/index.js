const cors = require("cors");
const express = require("express");

/**
 * 注册全局中间件
 */
function setupMiddleware(app) {
  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  app.use(express.json());
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

module.exports = { setupMiddleware, writeSSEHeaders };
