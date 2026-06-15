const { Router } = require("express")
const { openai, DEFAULT_MODEL } = require("../config")

const router = Router()

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

function extractJson(raw) {
  let jsonStr = raw.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) jsonStr = jsonMatch[1]
  const firstBrace = jsonStr.indexOf("{")
  const lastBrace = jsonStr.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  }
  return jsonStr
}

/**
 * POST /api/interview/score
 * AI 面试评分接口（非流式）
 * body: { question, answerPoints, userAnswer, model? }
 */
router.post("/score", async (req, res) => {
  const { question, answerPoints, userAnswer, model = DEFAULT_MODEL } = req.body || {}

  if (!question || !userAnswer) {
    return res.status(400).json({ error: "question 和 userAnswer 为必填字段" })
  }

  const pointsText = Array.isArray(answerPoints)
    ? answerPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : (answerPoints || "无参考答案")

  const prompt = SCORE_PROMPT
    .replace("{question}", question)
    .replace("{answerPoints}", pointsText)
    .replace("{userAnswer}", userAnswer)

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    })

    const raw = response.choices[0]?.message?.content || ""
    console.log("[interview/score] AI 原始返回:", raw.slice(0, 200))

    const result = JSON.parse(extractJson(raw))
    res.json({
      score: result.score ?? 0,
      correctness: result.correctness ?? 0,
      completeness: result.completeness ?? 0,
      clarity: result.clarity ?? 0,
      feedback: result.feedback || "暂无评价",
      improvedAnswer: result.improvedAnswer || "",
    })
  } catch (err) {
    console.error("[interview/score] 评分失败:", err.message)
    console.error("[interview/score] 错误详情:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
    // 返回 200 + 降级结果，避免浏览器控制台报 500
    res.json({
      error: err?.message || "评分服务异常",
      score: 5,
      correctness: 5,
      completeness: 5,
      clarity: 5,
      feedback: "AI 评分服务暂时不可用，已为你生成默认评分。请检查 API Key 配置或稍后重试。",
      improvedAnswer: "",
    })
  }
})

/**
 * POST /api/interview/evaluate
 * 深度面试评估接口（支持多轮追问）
 * body: { question, answerPoints, conversationHistory, model? }
 */
router.post("/evaluate", async (req, res) => {
  const {
    question,
    answerPoints,
    conversationHistory = [],
    model = DEFAULT_MODEL,
  } = req.body || {}

  if (!question || !conversationHistory.length) {
    return res.status(400).json({ error: "question 和 conversationHistory 为必填字段" })
  }

  const pointsText = Array.isArray(answerPoints)
    ? answerPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : (answerPoints || "无参考答案")

  const MAX_ROUNDS = 3
  const currentRounds = Math.floor(conversationHistory.length / 2)
  const forceComplete =
    currentRounds >= MAX_ROUNDS
      ? "**已达追问上限，本**次**必须**给出最终评价（action=complete），不要继续追问。**"
      : ""

  const historyText = conversationHistory
    .map((m) => {
      const label = m.role === "user" ? "考生" : "面试官"
      return `【${label}】${m.content}`
    })
    .join("\n\n")

  const prompt = EVALUATE_PROMPT
    .replace("{question}", question)
    .replace("{answerPoints}", pointsText)
    .replace("{history}", historyText)
    .replace(/\{maxRounds\}/g, String(MAX_ROUNDS))
    .replace("{currentRounds}", String(currentRounds))
    .replace("{forceComplete}", forceComplete)

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    })

    const raw = response.choices[0]?.message?.content || ""
    console.log("[interview/evaluate] AI 原始返回:", raw.slice(0, 200))

    const result = JSON.parse(extractJson(raw))

    if (result.action === "follow_up") {
      return res.json({
        action: "follow_up",
        followUpQuestion: result.followUpQuestion || "请进一步说明。",
        scoreHint: result.scoreHint ?? 5,
      })
    }

    // action === "complete" or fallback
    res.json({
      action: "complete",
      score: result.score ?? 0,
      correctness: result.correctness ?? 0,
      completeness: result.completeness ?? 0,
      clarity: result.clarity ?? 0,
      feedback: result.feedback || "暂无评价",
      improvedAnswer: result.improvedAnswer || "",
    })
  } catch (err) {
    console.error("[interview/evaluate] 评估失败:", err.message)
    // 降级：解析失败时强制返回 complete
    res.json({
      action: "complete",
      score: 5,
      correctness: 5,
      completeness: 5,
      clarity: 5,
      feedback: "AI 深度评估服务暂时不可用，已为你生成默认评分。",
      improvedAnswer: "",
    })
  }
})

module.exports = router
