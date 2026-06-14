const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const OpenAI = require("openai");

// 加载环境变量，优先读取项目根目录下的 .env.local
dotenv.config({
  path: path.resolve(__dirname, "..", ".env.local"),
});

const PORT = process.env.PORT || 8787;
const apiKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY;

if (!apiKey) {
  console.warn(
    "[server] 未检测到 DEEPSEEK_API_KEY 或 VITE_DEEPSEEK_API_KEY，请在项目根目录的 .env.local 中配置：VITE_DEEPSEEK_API_KEY=xxx",
  );
}

const openai = new OpenAI({
  apiKey,
  baseURL: "https://api.siliconflow.cn/v1",
  timeout: 30000,
});

const app = express();

// 基础中间件
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

/**
 * SSE 聊天补全接口
 * POST /api/chat
 * body: { model?: string, messages: Array<{ role: string, content: any }>, extraParams?: object }
 */
app.post("/api/chat", async (req, res) => {
  // 1. 强制写入响应头，打通所有拦截
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 2. 发送防缓冲填充物（就是前端收到的那些空格）
  res.write(": " + " ".repeat(2048) + "\n\n");

  // 仅仅提取模型和消息，丢弃其他可能干扰的乱七八糟的参数
  const { model = "deepseek-chat", messages = [] } = req.body || {};

  if (!messages.length) {
    res.write(`data: ${JSON.stringify({ error: "messages 不能为空" })}\n\n`);
    return res.end();
  }

  try {
    // console.log(`[server] 准备发送请求, 使用模型: ${model}`);
    const stream = await openai.chat.completions.create({
      model,
      messages,
      stream: true, // 强制流式
    });

    // console.log(`[server] 成功连接 API，开始接收数据流...`);
    
    // 3. 最纯净的循环：不检测任何假警报，有字就吐！
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      
      if (content != null && content !== "") {
        // process.stdout.write(content); // 在后端终端打印
        res.write(`data: ${JSON.stringify({ content: String(content) })}\n\n`); // 发给前端
      }
    }
    
    // console.log("\n[server] 流式输出结束");
    res.write("data: [DONE]\n\n");
    res.end();

  } catch (err) {
    console.error("\n[server] 接口报错:", err.message);
    res.write(`data: ${JSON.stringify({ error: err?.message || "未知错误" })}\n\n`);
    res.end();
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(
    `[server] Chat proxy server listening on http://localhost:${PORT}`,
  );
});
