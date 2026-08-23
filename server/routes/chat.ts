import { Router, type Request, type Response } from 'express'
import { writeSSEHeaders } from '../middleware'
import { streamChat } from '../services/deepseek'
import { DEFAULT_MODEL, sanitizeModel } from '../config'

const router = Router()

/**
 * POST /api/chat
 * SSE 聊天补全接口
 * body: { model?: string, messages: Array<{ role, content }> }
 */
router.post('/', async (req: Request, res: Response) => {
  writeSSEHeaders(res)

  const { model: rawModel = DEFAULT_MODEL, messages = [] } = req.body || {}
  const model = sanitizeModel(rawModel)

  if (!messages.length) {
    res.write(`data: ${JSON.stringify({ error: 'messages 不能为空' })}\n\n`)
    return res.end()
  }

  // 客户端断开时中止上游生成，避免继续计费
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  res.on('error', () => {})

  try {
    for await (const chunk of streamChat(model, messages, controller.signal)) {
      if (controller.signal.aborted) break
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
    }
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  } catch (err: any) {
    if (controller.signal.aborted) return
    console.error('[chat] 接口报错:', err.message)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err?.message || '未知错误' })}\n\n`)
      res.end()
    }
  }
})

export default router
