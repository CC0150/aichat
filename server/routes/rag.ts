/**
 * RAG 检索路由
 *
 * POST /api/rag/search — SSE 流式 RAG 查询
 *   入参: { query, kbId?, model?, topK? }
 *   返回: SSE 流，data: {"content":"..."}\n\n ... data: [DONE]\n\n
 */

import { Router, type Request, type Response } from 'express'
import { writeSSEHeaders } from '../middleware'
import { ragQuery } from '../services/rag'
import { sanitizeString } from '../utils/validate'
import { getOwnedMeta } from './knowledge'

const router = Router()

router.post('/search', async (req: Request, res: Response) => {
  const userId = req.userId as number
  const query = sanitizeString(req.body?.query, { maxLength: 2000 })
  const kbId = sanitizeString(req.body?.kbId, { maxLength: 50, required: false }) || undefined
  const model = sanitizeString(req.body?.model, { maxLength: 50, required: false }) || undefined
  const topK = Math.min(Math.max(parseInt(req.body?.topK, 10) || 5, 1), 20)

  if (!query) {
    return res.status(400).json({ error: 'query 不能为空' })
  }

  // 指定知识库时先校验归属，防止越权检索
  if (kbId && !(await getOwnedMeta(userId, kbId))) {
    return res.status(404).json({ error: '知识库不存在' })
  }

  writeSSEHeaders(res)

  // 客户端断开时中止上游生成，避免继续计费
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  res.on('error', () => {})

  try {
    for await (const chunk of ragQuery(query, { userId, kbId, model, topK }, controller.signal)) {
      if (controller.signal.aborted) break
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
    }
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  } catch (err: any) {
    if (controller.signal.aborted) return
    console.error('[rag] 查询失败:', err.message)
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
  }
})

export default router
