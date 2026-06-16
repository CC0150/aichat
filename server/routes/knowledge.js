const { Router } = require("express")
const fs = require("fs/promises")
const path = require("path")
const { DEFAULT_MODEL } = require("../config")
const { callAI } = require("../services/aiCompletions")
const { handleAIError } = require("../services/errorHandler")
const { DIFFICULTY_MAP } = require("../utils/constants")
const { sanitizeString, validateEnum, clampNumber } = require("../utils/validate")

const router = Router()

const DATA_DIR = path.join(__dirname, "..", "data", "knowledge")
const INDEX_FILE = path.join(DATA_DIR, "index.json")

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (_) {}
}

async function readIndex() {
  await ensureDir(DATA_DIR)
  try {
    return JSON.parse(await fs.readFile(INDEX_FILE, "utf-8"))
  } catch {
    await fs.writeFile(INDEX_FILE, "[]", "utf-8")
    return []
  }
}

async function writeIndex(data) {
  await ensureDir(DATA_DIR)
  await fs.writeFile(INDEX_FILE, JSON.stringify(data, null, 2), "utf-8")
}

async function readMeta(kbId) {
  const metaPath = path.join(DATA_DIR, kbId, "meta.json")
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf-8"))
  } catch {
    return null
  }
}

async function writeMeta(kbId, data) {
  const kbDir = path.join(DATA_DIR, kbId)
  await ensureDir(kbDir)
  await fs.writeFile(path.join(kbDir, "meta.json"), JSON.stringify(data, null, 2), "utf-8")
}

async function readFileContent(kbId, fileId) {
  const filePath = path.join(DATA_DIR, kbId, "files", `${fileId}.txt`)
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

async function writeFileContent(kbId, fileId, content) {
  const filesDir = path.join(DATA_DIR, kbId, "files")
  await ensureDir(filesDir)
  await fs.writeFile(path.join(filesDir, `${fileId}.txt`), content, "utf-8")
}

async function deleteFileContent(kbId, fileId) {
  const filePath = path.join(DATA_DIR, kbId, "files", `${fileId}.txt`)
  try { await fs.unlink(filePath) } catch (_) {}
}

async function deleteKBDir(kbId) {
  const kbDir = path.join(DATA_DIR, kbId)
  try { await fs.rm(kbDir, { recursive: true, force: true }) } catch (_) {}
}

// ===== Routes =====

/** GET /api/knowledge — 列出所有知识库 */
router.get("/", async (_req, res) => {
  try {
    const list = await readIndex()
    res.json(list)
  } catch (err) {
    console.error("[knowledge] 列表读取失败:", err.message)
    res.json([])
  }
})

/** POST /api/knowledge — 创建知识库 */
router.post("/", async (req, res) => {
  const name = sanitizeString(req.body?.name, { maxLength: 100 })
  const description = sanitizeString(req.body?.description, { maxLength: 500, required: false }) || ""
  if (!name) {
    return res.status(400).json({ error: "知识库名称不能为空" })
  }

  try {
    const id = `kb-${Date.now()}`
    const now = new Date().toISOString()
    const meta = {
      id,
      name,
      description,
      createdAt: now,
      files: [],
    }
    await writeMeta(id, meta)

    const list = await readIndex()
    list.unshift({
      id,
      name,
      description,
      fileCount: 0,
      createdAt: now,
    })
    await writeIndex(list)

    res.json(meta)
  } catch (err) {
    console.error("[knowledge] 创建失败:", err.message)
    res.status(500).json({ error: "创建知识库失败" })
  }
})

/** DELETE /api/knowledge/:id — 删除知识库 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params
  try {
    await deleteKBDir(id)
    const list = (await readIndex()).filter((kb) => kb.id !== id)
    await writeIndex(list)
    res.json({ success: true })
  } catch (err) {
    console.error("[knowledge] 删除失败:", err.message)
    res.status(500).json({ error: "删除知识库失败" })
  }
})

/** GET /api/knowledge/:id — 获取知识库详情 */
router.get("/:id", async (req, res) => {
  const { id } = req.params
  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })
    res.json(meta)
  } catch (err) {
    console.error("[knowledge] 读取详情失败:", err.message)
    res.status(500).json({ error: "读取知识库失败" })
  }
})

/** POST /api/knowledge/:id/files — 上传文件到知识库 */
router.post("/:id/files", async (req, res) => {
  const { id } = req.params
  const name = sanitizeString(req.body?.name, { maxLength: 200 })
  const type = sanitizeString(req.body?.type, { maxLength: 20, required: false }) || "text"
  const content = sanitizeString(req.body?.content, { maxLength: 100000 })

  if (!name || !content) {
    return res.status(400).json({ error: "文件名和内容不能为空" })
  }

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })

    const fileId = `f-${Date.now()}`
    const fileRecord = {
      id: fileId,
      name,
      type,
      charCount: content.length,
      uploadedAt: new Date().toISOString(),
    }

    await writeFileContent(id, fileId, content)
    meta.files.push(fileRecord)
    await writeMeta(id, meta)

    const list = await readIndex()
    const idx = list.findIndex((kb) => kb.id === id)
    if (idx !== -1) {
      list[idx].fileCount = meta.files.length
      await writeIndex(list)
    }

    res.json(fileRecord)
  } catch (err) {
    console.error("[knowledge] 上传文件失败:", err.message)
    res.status(500).json({ error: "上传文件失败" })
  }
})

/** DELETE /api/knowledge/:id/files/:fileId — 删除文件 */
router.delete("/:id/files/:fileId", async (req, res) => {
  const { id, fileId } = req.params

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })

    meta.files = meta.files.filter((f) => f.id !== fileId)
    await writeMeta(id, meta)
    await deleteFileContent(id, fileId)

    const list = await readIndex()
    const idx = list.findIndex((kb) => kb.id === id)
    if (idx !== -1) {
      list[idx].fileCount = meta.files.length
      await writeIndex(list)
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

/** POST /api/knowledge/:id/generate — 基于知识库生成面试题 */
router.post("/:id/generate", async (req, res) => {
  const { id } = req.params
  const count = clampNumber(req.body?.questionCount, 1, 20, 5)
  const difficulty = validateEnum(req.body?.difficulty, ["all", "easy", "medium", "hard"], "all")
  const model = sanitizeString(req.body?.model, { required: false }) || DEFAULT_MODEL

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: "知识库不存在" })
    if (!meta.files || meta.files.length === 0) {
      return res.status(400).json({ error: "知识库中没有文件" })
    }

    // 聚合所有文件内容（异步读取）
    const parts = await Promise.all(meta.files.map(async (f) => {
      const text = await readFileContent(id, f.id) || ""
      return `【文件：${f.name}】\n${text}`
    }))
    let combined = parts.join("\n\n---\n\n")

    // 截断保护
    const MAX_CONTENT = 10000
    let truncationNote = ""
    if (combined.length > MAX_CONTENT) {
      combined = combined.slice(0, MAX_CONTENT)
      truncationNote = `\n\n（注意：知识库内容总量过大，此处仅保留前 ${MAX_CONTENT} 个字符。）`
    }

    const difficultyText = DIFFICULTY_MAP[difficulty]

    const prompt = GENERATE_FROM_KB_PROMPT
      .replace("{content}", combined + truncationNote)
      .replace("{count}", String(count))
      .replace("{difficulty}", difficultyText)

    const questions = await callAI({
      model, prompt, temperature: 0.5, maxTokens: 4000, logTag: "knowledge/generate",
    })

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
    handleAIError(res, err, "knowledge/generate", {
      fallbackMessage: "题目生成服务异常",
      extras: { questions: [] },
    })
  }
})

module.exports = router
