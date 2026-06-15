const { Router } = require("express")
const fs = require("fs")
const path = require("path")
const { openai, DEFAULT_MODEL } = require("../config")

const router = Router()

const DATA_DIR = path.join(__dirname, "..", "data", "knowledge")
const INDEX_FILE = path.join(DATA_DIR, "index.json")

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readIndex() {
  ensureDir(DATA_DIR)
  if (!fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, "[]", "utf-8")
    return []
  }
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"))
  } catch {
    return []
  }
}

function writeIndex(data) {
  ensureDir(DATA_DIR)
  fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2), "utf-8")
}

function readMeta(kbId) {
  const metaPath = path.join(DATA_DIR, kbId, "meta.json")
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"))
  } catch {
    return null
  }
}

function writeMeta(kbId, data) {
  const kbDir = path.join(DATA_DIR, kbId)
  ensureDir(kbDir)
  fs.writeFileSync(path.join(kbDir, "meta.json"), JSON.stringify(data, null, 2), "utf-8")
}

function readFileContent(kbId, fileId) {
  const filePath = path.join(DATA_DIR, kbId, "files", `${fileId}.txt`)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, "utf-8")
}

function writeFileContent(kbId, fileId, content) {
  const filesDir = path.join(DATA_DIR, kbId, "files")
  ensureDir(filesDir)
  fs.writeFileSync(path.join(filesDir, `${fileId}.txt`), content, "utf-8")
}

function deleteFileContent(kbId, fileId) {
  const filePath = path.join(DATA_DIR, kbId, "files", `${fileId}.txt`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function deleteKBDir(kbId) {
  const kbDir = path.join(DATA_DIR, kbId)
  if (fs.existsSync(kbDir)) fs.rmSync(kbDir, { recursive: true, force: true })
}

// ===== Routes =====

/** GET /api/knowledge — 列出所有知识库 */
router.get("/", (_req, res) => {
  try {
    const list = readIndex()
    res.json(list)
  } catch (err) {
    console.error("[knowledge] 列表读取失败:", err.message)
    res.json([])
  }
})

/** POST /api/knowledge — 创建知识库 */
router.post("/", (req, res) => {
  const { name, description = "" } = req.body || {}
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "知识库名称不能为空" })
  }

  try {
    const id = `kb-${Date.now()}`
    const now = new Date().toISOString()
    const meta = {
      id,
      name: name.trim(),
      description: description.trim(),
      createdAt: now,
      files: [],
    }
    writeMeta(id, meta)

    const list = readIndex()
    list.unshift({
      id,
      name: name.trim(),
      description: description.trim(),
      fileCount: 0,
      createdAt: now,
    })
    writeIndex(list)

    res.json(meta)
  } catch (err) {
    console.error("[knowledge] 创建失败:", err.message)
    res.status(500).json({ error: "创建知识库失败" })
  }
})

/** DELETE /api/knowledge/:id — 删除知识库 */
router.delete("/:id", (req, res) => {
  const { id } = req.params
  try {
    deleteKBDir(id)
    const list = readIndex().filter((kb) => kb.id !== id)
    writeIndex(list)
    res.json({ success: true })
  } catch (err) {
    console.error("[knowledge] 删除失败:", err.message)
    res.status(500).json({ error: "删除知识库失败" })
  }
})

/** GET /api/knowledge/:id — 获取知识库详情 */
router.get("/:id", (req, res) => {
  const { id } = req.params
  try {
    const meta = readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })
    res.json(meta)
  } catch (err) {
    console.error("[knowledge] 读取详情失败:", err.message)
    res.status(500).json({ error: "读取知识库失败" })
  }
})

/** POST /api/knowledge/:id/files — 上传文件到知识库 */
router.post("/:id/files", (req, res) => {
  const { id } = req.params
  const { name, type, content } = req.body || {}

  if (!name || !content) {
    return res.status(400).json({ error: "文件名和内容不能为空" })
  }

  try {
    const meta = readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })

    const fileId = `f-${Date.now()}`
    const fileRecord = {
      id: fileId,
      name: name.trim(),
      type: type || "text",
      charCount: content.length,
      uploadedAt: new Date().toISOString(),
    }

    writeFileContent(id, fileId, content)
    meta.files.push(fileRecord)
    writeMeta(id, meta)

    // 更新 index 中的 fileCount
    const list = readIndex()
    const idx = list.findIndex((kb) => kb.id === id)
    if (idx !== -1) {
      list[idx].fileCount = meta.files.length
      writeIndex(list)
    }

    res.json(fileRecord)
  } catch (err) {
    console.error("[knowledge] 上传文件失败:", err.message)
    res.status(500).json({ error: "上传文件失败" })
  }
})

/** DELETE /api/knowledge/:id/files/:fileId — 删除文件 */
router.delete("/:id/files/:fileId", (req, res) => {
  const { id, fileId } = req.params

  try {
    const meta = readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })

    meta.files = meta.files.filter((f) => f.id !== fileId)
    writeMeta(id, meta)
    deleteFileContent(id, fileId)

    // 更新 index
    const list = readIndex()
    const idx = list.findIndex((kb) => kb.id === id)
    if (idx !== -1) {
      list[idx].fileCount = meta.files.length
      writeIndex(list)
    }

    res.json({ success: true })
  } catch (err) {
    console.error("[knowledge] 删除文件失败:", err.message)
    res.status(500).json({ error: "删除文件失败" })
  }
})

// ===== 面试题生成 =====

const GENERATE_FROM_KB_PROMPT = `你是一位专业的面试官。请根据以下知识库文档内容，生成面试题。

## 知识库内容
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
  "category": "文档领域（英文小写）",
  "difficulty": "easy",
  "tags": ["标签1", "标签2"],
  "knowledgePoints": ["知识点1", "知识点2"],
  "question": "题目内容",
  "answerPoints": ["参考答案要点1", "要点2", "要点3"]
}
type 可选值：concept、coding、scenario
仅返回 JSON 数组，不要其他任何内容。`

const DIFFICULTY_MAP = {
  all: "简单 40%、中等 40%、困难 20%",
  easy: "全部为简单难度",
  medium: "全部为中等难度",
  hard: "全部为困难难度",
}

function extractJson(raw) {
  let jsonStr = raw.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) jsonStr = jsonMatch[1]
  const firstBracket = jsonStr.indexOf("[")
  const lastBracket = jsonStr.lastIndexOf("]")
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonStr = jsonStr.slice(firstBracket, lastBracket + 1)
  }
  return jsonStr
}

/** POST /api/knowledge/:id/generate — 基于知识库生成面试题 */
router.post("/:id/generate", async (req, res) => {
  const { id } = req.params
  const {
    questionCount = 5,
    difficulty = "all",
    model = DEFAULT_MODEL,
  } = req.body || {}

  try {
    const meta = readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })
    if (!meta.files || meta.files.length === 0) {
      return res.status(400).json({ error: "知识库中没有文件" })
    }

    // 聚合所有文件内容
    const parts = meta.files.map((f) => {
      const text = readFileContent(id, f.id) || ""
      return `【文件：${f.name}】\n${text}`
    })
    let combined = parts.join("\n\n---\n\n")

    // 截断保护
    const MAX_CONTENT = 10000
    let truncationNote = ""
    if (combined.length > MAX_CONTENT) {
      combined = combined.slice(0, MAX_CONTENT)
      truncationNote = `\n\n（注意：知识库内容总量过大，此处仅保留前 ${MAX_CONTENT} 个字符。）`
    }

    const count = Math.min(Math.max(questionCount, 1), 20)
    const difficultyText = DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP.all

    const prompt = GENERATE_FROM_KB_PROMPT
      .replace("{content}", combined + truncationNote)
      .replace("{count}", String(count))
      .replace("{difficulty}", difficultyText)

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 4000,
    })

    const raw = response.choices[0]?.message?.content || ""
    console.log("[knowledge/generate] AI 原始返回:", raw.slice(0, 200))

    const questions = JSON.parse(extractJson(raw))

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.json({ questions: [], error: "AI 未能生成有效题目，请重试。" })
    }

    const timestamp = Date.now()
    const result = questions.map((q, i) => ({
      id: q.id || `kbgen-${timestamp}-${i}`,
      type: q.type || "concept",
      category: q.category || "custom",
      difficulty: q.difficulty || "medium",
      tags: Array.isArray(q.tags) ? q.tags : [],
      knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
      question: q.question || "（题目生成失败）",
      answerPoints: Array.isArray(q.answerPoints) ? q.answerPoints : [],
    }))

    console.log(`[knowledge/generate] 成功生成 ${result.length} 道题目`)
    res.json({ questions: result })
  } catch (err) {
    console.error("[knowledge/generate] 生成失败:", err.message)
    if (err instanceof SyntaxError) {
      console.error("[knowledge/generate] JSON 解析失败")
    }
    res.json({
      error: err?.message || "题目生成服务异常",
      questions: [],
    })
  }
})

module.exports = router
