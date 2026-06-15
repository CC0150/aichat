const { Router } = require("express");
const { writeSSEHeaders } = require("../middleware");
const { streamChat } = require("../services/deepseek");
const { DEFAULT_MODEL } = require("../config");

const router = Router();

/**
 * POST /api/chat
 * SSE 聊天补全接口
 * body: { model?: string, messages: Array<{ role, content }> }
 */
router.post("/", async (req, res) => {
  writeSSEHeaders(res);

  const { model = DEFAULT_MODEL, messages = [] } = req.body || {};

  if (!messages.length) {
    res.write(`data: ${JSON.stringify({ error: "messages 不能为空" })}\n\n`);
    return res.end();
  }

  try {
    for await (const chunk of streamChat(model, messages)) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[chat] 接口报错:", err.message);
    res.write(
      `data: ${JSON.stringify({ error: err?.message || "未知错误" })}\n\n`
    );
    res.end();
  }
});

module.exports = router;
