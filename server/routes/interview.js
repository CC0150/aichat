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

    // 尝试从 AI 回复中提取 JSON（可能包含 markdown 代码块包裹）
    let jsonStr = raw.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) jsonStr = jsonMatch[1]
    const firstBrace = jsonStr.indexOf("{")
    const lastBrace = jsonStr.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }

    const result = JSON.parse(jsonStr)
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

module.exports = router
