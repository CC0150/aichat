const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')

// 加载环境变量，优先读取项目根目录下的 .env.local
dotenv.config({
  path: path.resolve(__dirname, '..', '.env.local'),
})

const PORT = process.env.PORT || 8787
// 支持 ZHIPU_API_KEY 或 VITE_ZHIPU_API_KEY
const apiKey = process.env.ZHIPU_API_KEY || process.env.VITE_ZHIPU_API_KEY

if (!apiKey) {
  console.warn(
    '[server] 未检测到 ZHIPU_API_KEY 或 VITE_ZHIPU_API_KEY，请在项目根目录的 .env.local 中配置：ZHIPU_API_KEY=xxx'
  )
}

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

const app = express()

// 基础中间件
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)
app.use(express.json())

/**
 * SSE 聊天补全接口
 * POST /api/chat
 * body: { model?: string, messages: Array<{ role: string, content: any }>, extraParams?: object }
 */
app.post('/api/chat', async (req, res) => {
  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  // 立即刷新响应头
  if (res.flushHeaders) {
    res.flushHeaders()
  }

  const { model = 'glm-4', messages = [], ...rest } = req.body || {}

  if (!Array.isArray(messages) || !messages.length) {
    res.write(
      `data: ${JSON.stringify({
        error: 'messages 不能为空',
      })}\n\n`
    )
    return res.end()
  }

  try {
    // 使用 fetch 直接调用智谱 API
    const response = await fetch(ZHIPU_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...rest,
      }),
    })

    if (!response.ok) {
      throw new Error(`智谱 API 请求失败: ${response.status} ${response.statusText}`)
    }

    // 获取响应流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    // 将智谱 API 的流结果转发为 SSE
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      res.write(chunk)
    }

    // 结束标记
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('[server] 调用智谱接口失败:', err)
    res.write(
      `data: ${JSON.stringify({
        error: err?.message || '未知错误',
      })}\n\n`
    )
    res.end()
  }
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`[server] Chat proxy server listening on http://localhost:${PORT}`)
})

