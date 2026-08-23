import { Router, type Request, type Response } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { DEFAULT_MODEL } from '../config'
import { callAI } from '../services/aiCompletions'
import { handleAIError } from '../services/errorHandler'
import { DIFFICULTY_MAP } from '../utils/constants'
import { sanitizeString, validateEnum, clampNumber } from '../utils/validate'
import { chunkSemantic } from '../services/chunker'
import { getEmbedding } from '../services/embedding'
import { addChunks, deleteByKB, deleteByFile } from '../services/vectorStore'
import { normalizeText } from '../utils/normalizeText'
import { agentGenerateQuestions, reindexKB } from '../services/agent'

const router = Router()

const DATA_DIR = path.join(__dirname, '..', 'data', 'knowledge')
const INDEX_FILE = path.join(DATA_DIR, 'index.json')

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    /* dir exists */
  }
}

async function readIndex(): Promise<any[]> {
  await ensureDir(DATA_DIR)
  try {
    return JSON.parse(await fs.readFile(INDEX_FILE, 'utf-8'))
  } catch {
    await fs.writeFile(INDEX_FILE, '[]', 'utf-8')
    return []
  }
}

async function writeIndex(data: any[]): Promise<void> {
  await ensureDir(DATA_DIR)
  await fs.writeFile(INDEX_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

async function readMeta(kbId: string): Promise<any | null> {
  const metaPath = path.join(DATA_DIR, kbId, 'meta.json')
  try {
    return JSON.parse(await fs.readFile(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

async function writeMeta(kbId: string, data: any): Promise<void> {
  const kbDir = path.join(DATA_DIR, kbId)
  await ensureDir(kbDir)
  await fs.writeFile(path.join(kbDir, 'meta.json'), JSON.stringify(data, null, 2), 'utf-8')
}

async function readFileContent(kbId: string, fileId: string): Promise<string | null> {
  const filePath = path.join(DATA_DIR, kbId, 'files', `${fileId}.txt`)
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

async function writeFileContent(kbId: string, fileId: string, content: string): Promise<void> {
  const filesDir = path.join(DATA_DIR, kbId, 'files')
  await ensureDir(filesDir)
  await fs.writeFile(path.join(filesDir, `${fileId}.txt`), content, 'utf-8')
}

async function deleteFileContent(kbId: string, fileId: string): Promise<void> {
  const filePath = path.join(DATA_DIR, kbId, 'files', `${fileId}.txt`)
  try {
    await fs.unlink(filePath)
  } catch {
    /* ignore */
  }
}

async function deleteKBDir(kbId: string): Promise<void> {
  const kbDir = path.join(DATA_DIR, kbId)
  try {
    await fs.rm(kbDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

// ===== Routes =====

/** GET /api/knowledge — 列出所有知识库 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await readIndex()
    res.json(list)
  } catch (err: any) {
    console.error('[knowledge] 列表读取失败:', err.message)
    res.json([])
  }
})

/** POST /api/knowledge — 创建知识库 */
router.post('/', async (req: Request, res: Response) => {
  const name = sanitizeString(req.body?.name, { maxLength: 100 })
  const description =
    sanitizeString(req.body?.description, { maxLength: 500, required: false }) || ''
  if (!name) {
    return res.status(400).json({ error: '知识库名称不能为空' })
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
  } catch (err: any) {
    console.error('[knowledge] 创建失败:', err.message)
    res.status(500).json({ error: '创建知识库失败' })
  }
})

/** DELETE /api/knowledge/:id — 删除知识库 */
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    await deleteKBDir(id)
    deleteByKB(id).catch((err: any) =>
      console.error(`[knowledge] 清理向量失败 ${id}:`, err.message),
    )
    const list = (await readIndex()).filter((kb) => kb.id !== id)
    await writeIndex(list)
    res.json({ success: true })
  } catch (err: any) {
    console.error('[knowledge] 删除失败:', err.message)
    res.status(500).json({ error: '删除知识库失败' })
  }
})

/** PATCH /api/knowledge/:id — 更新知识库名称与描述 */
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const name = sanitizeString(req.body?.name, { maxLength: 100 })
  const description =
    sanitizeString(req.body?.description, { maxLength: 500, required: false }) || ''

  if (!name) return res.status(400).json({ error: '知识库名称不能为空' })

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: '知识库不存在' })

    meta.name = name
    meta.description = description
    await writeMeta(id, meta)

    // 同步更新 index 列表
    const list = await readIndex()
    const idx = list.findIndex((kb: any) => kb.id === id)
    if (idx !== -1) {
      list[idx].name = name
      list[idx].description = description
      await writeIndex(list)
    }

    res.json({ id, name, description })
  } catch (err: any) {
    console.error('[knowledge] 更新失败:', err.message)
    res.status(500).json({ error: '更新知识库失败' })
  }
})

/** GET /api/knowledge/:id — 获取知识库详情 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: '知识库不存在' })
    res.json(meta)
  } catch (err: any) {
    console.error('[knowledge] 读取详情失败:', err.message)
    res.status(500).json({ error: '读取知识库失败' })
  }
})

/** POST /api/knowledge/:id/files — 上传文件到知识库 */
router.post('/:id/files', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const name = sanitizeString(req.body?.name, { maxLength: 200 })
  const type = sanitizeString(req.body?.type, { maxLength: 20, required: false }) || 'text'
  const content = sanitizeString(req.body?.content, { maxLength: 100000 })

  if (!name || !content) {
    return res.status(400).json({ error: '文件名和内容不能为空' })
  }

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: '知识库不存在' })

    const fileId = `f-${Date.now()}`
    // 清洗 PDF 解析乱码
    const cleanedContent = type === 'pdf' ? normalizeText(content) : content
    const fileRecord = {
      id: fileId,
      name,
      type,
      charCount: cleanedContent.length,
      uploadedAt: new Date().toISOString(),
    }

    await writeFileContent(id, fileId, cleanedContent)
    meta.files.push(fileRecord)
    await writeMeta(id, meta)

    // RAG 入库：语义分块 → embedding → 存向量库（异步，不阻塞接口响应）
    setImmediate(async () => {
      try {
        const chunks = await chunkSemantic(cleanedContent, { chunkSize: 500, overlap: 100 })
        if (chunks.length === 0) return
        const vectors = await getEmbedding(chunks)
        await addChunks(
          chunks.map((text, i) => ({
            vector: vectors[i],
            text,
            id: `chunk-${fileId}-${i}`,
            kbId: id,
            fileId,
          })),
        )
        console.log(`[knowledge] RAG 入库完成: ${fileId} → ${chunks.length} 个 chunk`)
      } catch (err: any) {
        console.error(`[knowledge] RAG 入库失败 ${fileId}:`, err.message)
      }
    })

    const list = await readIndex()
    const idx = list.findIndex((kb: any) => kb.id === id)
    if (idx !== -1) {
      list[idx].fileCount = meta.files.length
      await writeIndex(list)
    }

    res.json(fileRecord)
  } catch (err: any) {
    console.error('[knowledge] 上传文件失败:', err.message)
    res.status(500).json({ error: '上传文件失败' })
  }
})

/** DELETE /api/knowledge/:id/files/:fileId — 删除文件 */
router.delete('/:id/files/:fileId', async (req: Request, res: Response) => {
  const { id, fileId } = req.params as { id: string; fileId: string }

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: '知识库不存在' })

    meta.files = meta.files.filter((f: any) => f.id !== fileId)
    await writeMeta(id, meta)
    await deleteFileContent(id, fileId)

    // 同步清理向量库
    deleteByFile(fileId).catch((err: any) =>
      console.error(`[knowledge] 清理向量失败 ${fileId}:`, err.message),
    )

    const list = await readIndex()
    const idx = list.findIndex((kb: any) => kb.id === id)
    if (idx !== -1) {
      list[idx].fileCount = meta.files.length
      await writeIndex(list)
    }

    res.json({ success: true })
  } catch (err: any) {
    console.error('[knowledge] 删除文件失败:', err.message)
    res.status(500).json({ error: '删除文件失败' })
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
router.post('/:id/generate', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const count = clampNumber(req.body?.questionCount, 1, 20, 5)
  const difficulty = validateEnum(
    req.body?.difficulty,
    ['all', 'easy', 'medium', 'hard'] as const,
    'all',
  )
  const model = sanitizeString(req.body?.model, { required: false }) || DEFAULT_MODEL

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: '知识库不存在' })
    if (!meta.files || meta.files.length === 0) {
      return res.status(400).json({ error: '知识库中没有文件' })
    }

    // 聚合所有文件内容（异步读取）
    const parts = await Promise.all(
      meta.files.map(async (f: any) => {
        const text = (await readFileContent(id, f.id)) || ''
        return `【文件：${f.name}】\n${text}`
      }),
    )
    let combined = parts.join('\n\n---\n\n')

    // 截断保护
    const MAX_CONTENT = 10000
    let truncationNote = ''
    if (combined.length > MAX_CONTENT) {
      combined = combined.slice(0, MAX_CONTENT)
      truncationNote = `\n\n（注意：知识库内容总量过大，此处仅保留前 ${MAX_CONTENT} 个字符。）`
    }

    const difficultyText = DIFFICULTY_MAP[difficulty!]

    const prompt = GENERATE_FROM_KB_PROMPT.replace('{content}', combined + truncationNote)
      .replace('{count}', String(count))
      .replace('{difficulty}', difficultyText)

    const questions = await callAI({
      model,
      prompt,
      temperature: 0.5,
      maxTokens: 4000,
      logTag: 'knowledge/generate',
    })

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.json({ questions: [], error: 'AI 未能生成有效题目，请重试。' })
    }

    const timestamp = Date.now()
    const result = questions.map((q: any, i: number) => ({
      id: q.id || `kbgen-${timestamp}-${i}`,
      type: q.type || 'concept',
      category: q.category || 'custom',
      difficulty: q.difficulty || 'medium',
      tags: Array.isArray(q.tags) ? q.tags : [],
      knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
      question: q.question || '（题目生成失败）',
      answerPoints: Array.isArray(q.answerPoints) ? q.answerPoints : [],
    }))

    console.log(`[knowledge/generate] 成功生成 ${result.length} 道题目`)
    res.json({ questions: result })
  } catch (err) {
    handleAIError(res, err, 'knowledge/generate', {
      fallbackMessage: '题目生成服务异常',
      extras: { questions: [] },
    })
  }
})

/** POST /api/knowledge/:id/agent-generate — Agent 驱动出题 */
router.post('/:id/agent-generate', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const count = clampNumber(req.body?.questionCount, 1, 20, 5)
  const difficulty = validateEnum(
    req.body?.difficulty,
    ['all', 'easy', 'medium', 'hard'] as const,
    'all',
  )
  const model = sanitizeString(req.body?.model, { required: false }) || DEFAULT_MODEL

  try {
    const meta = await readMeta(id)
    if (!meta) return res.status(404).json({ error: '知识库不存在' })
    if (!meta.files || meta.files.length === 0)
      return res.status(400).json({ error: '知识库中没有文件' })

    const result = await agentGenerateQuestions({
      kbId: id,
      count,
      difficulty: difficulty ?? 'all',
      model,
    })
    res.json(result)
  } catch (err) {
    handleAIError(res, err, 'knowledge/agent-generate', {
      fallbackMessage: 'Agent 出题异常',
      extras: { questions: [] },
    })
  }
})

/** POST /api/knowledge/:id/reindex — 重新索引知识库 */
router.post('/:id/reindex', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    const result = await reindexKB(id)
    if (result.error) return res.status(404).json(result)
    res.json(result)
  } catch (err: any) {
    console.error('[knowledge] 重新索引失败:', err.message)
    res.status(500).json({ error: err.message || '重新索引失败' })
  }
})

export default router
