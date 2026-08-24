import { Router, type Request, type Response } from 'express'
import { DEFAULT_MODEL, sanitizeModel } from '../config'
import { callAI } from '../services/aiCompletions'
import { handleAIError } from '../services/errorHandler'
import { runInterviewEvaluate, runInterviewEvaluateStream } from '../services/agent'
import { sanitizeString } from '../utils/validate'
import { writeSSEHeaders } from '../middleware'
import { deleteRecord, listRecords, upsertRecord } from '../db'
import type { AgentEvaluateResult } from '../types'

const router = Router()

/** 格式化参考答案要点为编号列表 */
function formatAnswerPoints(answerPoints: unknown): string {
  return Array.isArray(answerPoints)
    ? answerPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : ((answerPoints || '无参考答案') as string)
}

/** 构建评分结果对象 */
function buildScoreResult(result: any, extra: Record<string, unknown> = {}): any {
  return {
    ...extra,
    score: result.score ?? 0,
    correctness: result.correctness ?? 0,
    completeness: result.completeness ?? 0,
    clarity: result.clarity ?? 0,
    feedback: result.feedback || '暂无评价',
    improvedAnswer: result.improvedAnswer || '',
  }
}

const SCORE_PROMPT = `你是一位资深的前端技术面试官。请根据以下信息对考生的回答进行评分。

## 题目
{question}

## 参考答案要点
{answerPoints}

## 考生回答
{userAnswer}

## 评分要求
请严格按以下 JSON 格式返回评分结果（不要返回其他任何内容）：
{
  "score": 1-10的整数,
  "correctness": 1-10的整数（正确性）,
  "completeness": 1-10的整数（完整性，覆盖了几个要点）,
  "clarity": 1-10的整数（表达清晰度）,
  "feedback": "简短的评价，50字以内，指出优点和不足",
  "improvedAnswer": "一个更好的参考答案，100字以内，自然语气"
}`

const EVALUATE_PROMPT = `你是一位资深的前端技术面试官，正在进行深度面试。请根据对话历史对考生进行追问或给出最终评价。

## 题目
{question}

## 参考答案要点
{answerPoints}

## 对话历史
{history}

## 评估规则
1. 如果回答深度不够、遗漏关键点、表达模糊，且追问轮次未达到上限，请进行针对性追问。
2. 追问应自然、具体，直击回答中的薄弱环节，不要泛泛而问。
3. 如果回答已经充分覆盖要点，或已达到追问上限（{maxRounds}轮），请给出最终评价。
4. 你当前已追问了 {currentRounds} 轮，上限是 {maxRounds} 轮。{forceComplete}

## 返回格式（仅返回 JSON，不要其他内容）
- 追问时：{"action":"follow_up","followUpQuestion":"追问内容（一句话，简洁有针对性）","scoreHint":当前估算分(1-10)}
- 完成时：{"action":"complete","score":整数,"correctness":整数,"completeness":整数,"clarity":整数,"feedback":"50字以内的简短评价","improvedAnswer":"100字以内的自然语气参考答案"}`

/**
 * POST /api/interview/score
 * AI 面试评分接口（非流式）
 * body: { question, answerPoints, userAnswer, model? }
 */
router.post('/score', async (req: Request, res: Response) => {
  const question = sanitizeString(req.body?.question, { maxLength: 2000 })
  const userAnswer = sanitizeString(req.body?.userAnswer, { maxLength: 5000 })
  const answerPoints = req.body?.answerPoints
  const rawModel = sanitizeString(req.body?.model, { required: false })
  const model = sanitizeModel(rawModel || DEFAULT_MODEL)

  if (!question || !userAnswer) {
    return res.status(400).json({ error: 'question 和 userAnswer 为必填字段' })
  }

  const pointsText = formatAnswerPoints(answerPoints)

  const prompt = SCORE_PROMPT.replace('{question}', question)
    .replace('{answerPoints}', pointsText)
    .replace('{userAnswer}', userAnswer)

  try {
    const result = await callAI({
      model,
      prompt,
      temperature: 0.3,
      maxTokens: 600,
      logTag: 'interview/score',
    })
    res.json(buildScoreResult(result))
  } catch (err) {
    handleAIError(res, err, 'interview/score', { fallbackMessage: '评分服务异常' })
  }
})

/**
 * POST /api/interview/evaluate
 * 深度面试评估接口（支持多轮追问）
 * body: { question, answerPoints, conversationHistory, model? }
 */
router.post('/evaluate', async (req: Request, res: Response) => {
  const { question, answerPoints, conversationHistory = [], model = DEFAULT_MODEL } = req.body || {}
  const safeQuestion = sanitizeString(question, { maxLength: 2000 })
  const safeModel = sanitizeModel(sanitizeString(model, { required: false }) || DEFAULT_MODEL)

  if (!safeQuestion || !conversationHistory.length) {
    return res.status(400).json({ error: 'question 和 conversationHistory 为必填字段' })
  }

  const pointsText = formatAnswerPoints(answerPoints)

  const MAX_ROUNDS = 3
  const currentRounds = Math.floor(conversationHistory.length / 2)
  const forceComplete =
    currentRounds >= MAX_ROUNDS
      ? '**已达追问上限，本次必须给出最终评价（action=complete），不要继续追问。**'
      : ''

  const historyText = conversationHistory
    .map((m: { role: string; content: string }) => {
      const label = m.role === 'user' ? '考生' : '面试官'
      return `【${label}】${m.content}`
    })
    .join('\n\n')

  const prompt = EVALUATE_PROMPT.replace('{question}', safeQuestion)
    .replace('{answerPoints}', pointsText)
    .replace('{history}', historyText)
    .replace(/\{maxRounds\}/g, String(MAX_ROUNDS))
    .replace('{currentRounds}', String(currentRounds))
    .replace('{forceComplete}', forceComplete)

  try {
    const result = await callAI({
      model: safeModel,
      prompt,
      temperature: 0.3,
      maxTokens: 600,
      logTag: 'interview/evaluate',
    })

    if (result.action === 'follow_up') {
      return res.json({
        action: 'follow_up',
        followUpQuestion: result.followUpQuestion || '请进一步说明。',
        scoreHint: result.scoreHint ?? 5,
      })
    }

    // action === "complete" or fallback
    res.json(buildScoreResult(result, { action: 'complete' }))
  } catch (err) {
    handleAIError(res, err, 'interview/evaluate', { fallbackMessage: '评估服务异常' })
  }
})

/**
 * POST /api/interview/agent-evaluate
 * Agent 驱动评估（自动搜索知识库 + 评分 + 追问决策）
 * body: { question, answerPoints, conversationHistory, kbId?, model? }
 */
router.post('/agent-evaluate', async (req: Request, res: Response) => {
  const question = sanitizeString(req.body?.question, { maxLength: 2000 })
  const answerPoints = req.body?.answerPoints
  const conversationHistory = req.body?.conversationHistory || []
  const kbId = sanitizeString(req.body?.kbId, { maxLength: 50, required: false }) || undefined
  const rawModel = sanitizeString(req.body?.model, { required: false })
  const model = sanitizeModel(rawModel || DEFAULT_MODEL)

  if (!question || !conversationHistory.length) {
    return res.status(400).json({ error: 'question 和 conversationHistory 为必填字段' })
  }

  try {
    const result: AgentEvaluateResult = await runInterviewEvaluate({
      question,
      answerPoints,
      conversationHistory,
      kbId,
      userId: req.userId as number,
      model,
    })
    res.json(result)
  } catch (err: any) {
    console.error('[interview/agent-evaluate] 失败:', err.message)
    // 返回 500 让前端显示"重新点评"按钮
    res.status(500).json({ error: err.message || 'Agent 评估服务异常' })
  }
})

/**
 * POST /api/interview/agent-evaluate-stream
 * Agent 驱动评估 —— SSE 流式版本
 *
 * 通过 SSE 实时推送 Agent 每一步的思考和工具调用过程：
 *   thinking   → "AI 正在思考..."（前端显示 spinner）
 *   tool_call  → Agent 调用了某个工具（前端显示工具卡片 + loading）
 *   tool_result → 工具执行完毕（前端更新卡片为完成状态）
 *   done       → Agent 完成，携带最终评估结果
 *   error      → 异常终止
 *
 * body: { question, answerPoints, conversationHistory, kbId?, model? }
 */
router.post('/agent-evaluate-stream', async (req: Request, res: Response) => {
  const question = sanitizeString(req.body?.question, { maxLength: 2000 })
  const answerPoints = req.body?.answerPoints
  const conversationHistory = req.body?.conversationHistory || []
  const kbId = sanitizeString(req.body?.kbId, { maxLength: 50, required: false }) || undefined
  const rawModel = sanitizeString(req.body?.model, { required: false })
  const model = sanitizeModel(rawModel || DEFAULT_MODEL)

  if (!question || !conversationHistory.length) {
    return res.status(400).json({ error: 'question 和 conversationHistory 为必填字段' })
  }

  writeSSEHeaders(res)

  // 客户端断开时中止上游生成，避免继续计费
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  res.on('error', () => {})

  // SSE 保活：每 15 秒发一个 comment 行防止代理超时断连
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n')
  }, 15000)

  try {
    for await (const event of runInterviewEvaluateStream({
      question,
      answerPoints,
      conversationHistory,
      kbId,
      userId: req.userId as number,
      model,
      signal: controller.signal,
    })) {
      if (controller.signal.aborted) break
      res.write(`data: ${JSON.stringify(event)}\n\n`)

      // done 或 error 事件到达 → 结束流
      if (event.type === 'done' || event.type === 'error') {
        break
      }
    }
  } catch (err: any) {
    if (!controller.signal.aborted) {
      console.error('[interview/agent-evaluate-stream] 失败:', err.message)
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: err.message || '流式评估异常' })}\n\n`,
        )
      }
    }
  } finally {
    clearInterval(keepAlive)
    try {
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n')
        res.end()
      }
    } catch {
      // 连接已断开，忽略写入错误
    }
  }
})

// ===== 面试记录持久化（按 req.userId 隔离） =====

/** GET /api/interview/records — 当前用户的面试记录列表 */
router.get('/records', (req: Request, res: Response) => {
  const userId = req.userId as number
  const records = listRecords(userId).map((r) => r.data)
  res.json({ records })
})

/** POST /api/interview/records — 保存一条面试记录 */
router.post('/records', (req: Request, res: Response) => {
  const userId = req.userId as number
  const data: any = req.body?.record
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: '缺少面试记录' })
    return
  }
  const rawId = sanitizeString(data.id, { maxLength: 100, required: false }) || String(Date.now())
  const finishedAt =
    typeof data.finishedAt === 'string' ? new Date(data.finishedAt).getTime() : Date.now()
  upsertRecord(userId, {
    id: rawId,
    data,
    updatedAt: Number.isNaN(finishedAt) ? Date.now() : finishedAt,
  })
  res.status(201).json({ success: true })
})

/** DELETE /api/interview/records/:id — 删除一条面试记录 */
router.delete('/records/:id', (req: Request, res: Response) => {
  const userId = req.userId as number
  const id = sanitizeString(req.params.id, { maxLength: 100 })
  if (!id) {
    res.status(400).json({ error: '记录 id 无效' })
    return
  }
  deleteRecord(userId, id)
  res.json({ success: true })
})

export default router
