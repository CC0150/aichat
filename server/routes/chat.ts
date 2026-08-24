import { Router, type Request, type Response } from 'express'
import { writeSSEHeaders } from '../middleware'
import { streamChat } from '../services/deepseek'
import { DEFAULT_MODEL, sanitizeModel } from '../config'
import { sanitizeString } from '../utils/validate'
import { deleteChat, getChat, getMessages, listChats, upsertChat, upsertMessages } from '../db'

const router = Router()

// ===== 会话历史 CRUD（按 req.userId 隔离，/api 已挂 requireAuth） =====

/** GET /api/chat — 当前用户的会话列表（仅元信息） */
router.get('/', (req: Request, res: Response) => {
  const userId = req.userId as number
  const chats = listChats(userId).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: new Date(c.updated_at).toISOString(),
  }))
  res.json({ chats })
})

/** GET /api/chat/:id — 单个会话及其消息 */
router.get('/:id', (req: Request, res: Response) => {
  const userId = req.userId as number
  const id = sanitizeString(req.params.id, { maxLength: 100 })
  if (!id) {
    res.status(400).json({ error: '会话 id 无效' })
    return
  }
  const chat = getChat(userId, id)
  if (!chat) {
    res.status(404).json({ error: '会话不存在' })
    return
  }
  res.json({
    chat: { id: chat.id, title: chat.title, updatedAt: new Date(chat.updated_at).toISOString() },
    messages: getMessages(userId, id) ?? [],
  })
})

/** PUT /api/chat/:id — 幂等创建/更新会话（标题 + 可选全量消息） */
router.put('/:id', (req: Request, res: Response) => {
  const userId = req.userId as number
  const id = sanitizeString(req.params.id, { maxLength: 100 })
  if (!id) {
    res.status(400).json({ error: '会话 id 无效' })
    return
  }
  const title = sanitizeString(req.body?.title, { maxLength: 100, required: false }) ?? ''
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null
  const updatedAt = typeof req.body?.updatedAt === 'number' ? req.body.updatedAt : Date.now()

  upsertChat(userId, { id, title, updatedAt })
  if (messages) upsertMessages(userId, id, messages, updatedAt)
  res.json({ success: true })
})

/** DELETE /api/chat/:id — 删除会话及其消息 */
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.userId as number
  const id = sanitizeString(req.params.id, { maxLength: 100 })
  if (!id) {
    res.status(400).json({ error: '会话 id 无效' })
    return
  }
  deleteChat(userId, id)
  res.json({ success: true })
})

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
