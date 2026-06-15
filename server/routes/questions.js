const { Router } = require("express")
const { openai, DEFAULT_MODEL } = require("../config")

const router = Router()

const DIFFICULTY_MAP = {
  all: "简单 40%、中等 40%、困难 20%",
  easy: "全部为简单难度",
  medium: "全部为中等难度",
  hard: "全部为困难难度",
}

const GENERATE_PROMPT = `你是一位专业的面试官。请根据用户提供的文档内容，生成面试题。

## 文档内容
{content}

## 出题要求
- 共生成 {count} 道题目
- 难度分布：{difficulty}
- 题目应覆盖文档中的核心知识点，问题简洁明确
- 每道题需包含题目描述、参考答案要点、题目类型、标签、知识点

## 返回格式
返回一个 JSON 数组，每道题格式如下：
{
  "type": "concept",
  "category": "文档领域（英文小写，如 java、python、database、network）",
  "difficulty": "easy",
  "tags": ["标签1", "标签2"],
  "knowledgePoints": ["知识点1", "知识点2"],
  "question": "题目内容（简洁明了的一句话或一段话）",
  "answerPoints": ["参考答案要点1", "要点2", "要点3"]
}
type 可选值：concept（概念题）、coding（编程题）、scenario（场景题）
仅返回 JSON 数组，不要其他任何内容。`

function extractJson(raw) {
  let jsonStr = raw.trim()
  // 去除 markdown 代码块包裹
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) jsonStr = jsonMatch[1]
  // 定位首尾括号
  const firstBracket = jsonStr.indexOf("[")
  const lastBracket = jsonStr.lastIndexOf("]")
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonStr = jsonStr.slice(firstBracket, lastBracket + 1)
  }
  return jsonStr
}

/**
 * POST /api/questions/generate
 * 根据文档内容生成面试题
 * body: { content, questionCount, difficulty?, model? }
 */
router.post("/generate", async (req, res) => {
  const {
    content,
    questionCount = 5,
    difficulty = "all",
    model = DEFAULT_MODEL,
  } = req.body || {}

  if (!content) {
    return res.status(400).json({ error: "content 为必填字段" })
  }

  const count = Math.min(Math.max(questionCount, 1), 20)
  const difficultyText = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.all

  // 内容截断保护，防止超长文档超出上下文窗口
  const MAX_CONTENT = 8000
  let trimmedContent = content.trim()
  let truncationNote = ""
  if (trimmedContent.length > MAX_CONTENT) {
    trimmedContent = trimmedContent.slice(0, MAX_CONTENT)
    truncationNote = `\n\n（注意：原始文档过长，此处仅保留前 ${MAX_CONTENT} 个字符。）`
  }

  const prompt = GENERATE_PROMPT
    .replace("{content}", trimmedContent + truncationNote)
    .replace("{count}", String(count))
    .replace("{difficulty}", difficultyText)

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 4000,
    })

    const raw = response.choices[0]?.message?.content || ""
    console.log("[questions/generate] AI 原始返回:", raw.slice(0, 200))

    const questions = JSON.parse(extractJson(raw))

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.json({ questions: [], error: "AI 未能生成有效题目，请重试。" })
    }

    // 为每道题补全必要字段并生成唯一 id
    const timestamp = Date.now()
    const result = questions.map((q, i) => ({
      id: q.id || `gen-${timestamp}-${i}`,
      type: q.type || "concept",
      category: q.category || "custom",
      difficulty: q.difficulty || "medium",
      tags: Array.isArray(q.tags) ? q.tags : [],
      knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
      question: q.question || "（题目生成失败）",
      answerPoints: Array.isArray(q.answerPoints) ? q.answerPoints : [],
    }))

    console.log(`[questions/generate] 成功生成 ${result.length} 道题目`)
    res.json({ questions: result })
  } catch (err) {
    console.error("[questions/generate] 生成失败:", err.message)
    if (err instanceof SyntaxError) {
      console.error("[questions/generate] JSON 解析失败，原始返回:", String(err).slice(0, 300))
    }
    res.json({
      error: err?.message || "题目生成服务异常",
      questions: [],
    })
  }
})

const ROLE_PROMPT = `你是一位经验丰富的技术面试官。请根据目标岗位生成专业的面试题。

## 目标岗位
{role}

## 出题要求
- 共生成 {count} 道题目
- 难度分布：{difficulty}
- 题目应覆盖该岗位的核心知识点和常见面试考点
- 每道题需包含题目描述、参考答案要点、题目类型、标签、知识点
- 题目应该是一般性面试问题，不预设特定的文档或上下文

## 返回格式
返回一个 JSON 数组，每道题格式如下：
{
  "type": "concept",
  "category": "岗位领域（英文小写，如 java、python、frontend、database、network、algorithm）",
  "difficulty": "easy",
  "tags": ["标签1", "标签2"],
  "knowledgePoints": ["知识点1", "知识点2"],
  "question": "题目内容（简洁明了的一句话或一段话）",
  "answerPoints": ["参考答案要点1", "要点2", "要点3"]
}
type 可选值：concept（概念题）、coding（编程题）、scenario（场景题）
仅返回 JSON 数组，不要其他任何内容。`

/**
 * POST /api/questions/generate-by-role
 * 根据目标岗位 AI 生成面试题
 * body: { role, questionCount, difficulty?, model? }
 */
router.post("/generate-by-role", async (req, res) => {
  const {
    role,
    questionCount = 5,
    difficulty = "all",
    model = DEFAULT_MODEL,
  } = req.body || {}

  if (!role || !role.trim()) {
    return res.status(400).json({ error: "role 为必填字段" })
  }

  const count = Math.min(Math.max(questionCount, 1), 20)
  const difficultyText = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.all

  const prompt = ROLE_PROMPT
    .replace("{role}", role.trim())
    .replace("{count}", String(count))
    .replace("{difficulty}", difficultyText)

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 4000,
    })

    const raw = response.choices[0]?.message?.content || ""
    console.log("[questions/generate-by-role] AI 原始返回:", raw.slice(0, 200))

    const questions = JSON.parse(extractJson(raw))

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.json({ questions: [], error: "AI 未能生成有效题目，请重试。" })
    }

    const timestamp = Date.now()
    const result = questions.map((q, i) => ({
      id: q.id || `gen-role-${timestamp}-${i}`,
      type: q.type || "concept",
      category: q.category || role.trim(),
      difficulty: q.difficulty || "medium",
      tags: Array.isArray(q.tags) ? q.tags : [],
      knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
      question: q.question || "（题目生成失败）",
      answerPoints: Array.isArray(q.answerPoints) ? q.answerPoints : [],
    }))

    console.log(`[questions/generate-by-role] 成功生成 ${result.length} 道题目（岗位: ${role.trim()}）`)
    res.json({ questions: result })
  } catch (err) {
    console.error("[questions/generate-by-role] 生成失败:", err.message)
    if (err instanceof SyntaxError) {
      console.error("[questions/generate-by-role] JSON 解析失败，原始返回:", String(err).slice(0, 300))
    }
    res.json({
      error: err?.message || "题目生成服务异常",
      questions: [],
    })
  }
})

module.exports = router
