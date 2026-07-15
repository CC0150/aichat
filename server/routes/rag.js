/**
 * RAG 检索路由
 *
 * POST /api/rag/search — SSE 流式 RAG 查询
 *   入参: { query, kbId?, model?, topK? }
 *   返回: SSE 流，data: {"content":"..."}\n\n ... data: [DONE]\n\n
 */

const { Router } = require('express')
const { writeSSEHeaders } = require('../middleware')
const { ragQuery } = require('../services/rag')
const { sanitizeString } = require('../utils/validate')

const router = Router()

router.post('/search', async (req, res) => {
  const query = sanitizeString(req.body?.query, { maxLength: 2000 })
  const kbId = sanitizeString(req.body?.kbId, { maxLength: 50, required: false }) || undefined
  const model = sanitizeString(req.body?.model, { maxLength: 50, required: false }) || undefined
  const topK = Math.min(Math.max(parseInt(req.body?.topK, 10) || 5, 1), 20)

  if (!query) {
    return res.status(400).json({ error: 'query 不能为空' })
  }

  writeSSEHeaders(res)

  try {
    for await (const chunk of ragQuery(query, { kbId, model, topK })) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('[rag] 查询失败:', err.message)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

module.exports = router
