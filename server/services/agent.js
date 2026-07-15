/**
 * AI 面试官 Agent
 *
 * 面试评估专用 —— 定义工具 + 调用 agentLoop 执行评估
 */

const { agentLoop } = require('../utils/agentLoop')

// ===== 工具定义 =====

const tools = [
  {
    type: 'function',
    function: {
      name: 'searchKnowledgeBase',
      description: '从知识库中搜索相关文档内容。当需要查找特定技术知识、面试题素材、或验证答案准确性时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或问题，尽量简洁明确' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gradeAnswer',
      description: '对用户的面试回答进行评分，返回 1-10 分和详细反馈。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '原面试题' },
          answer: { type: 'string', description: '用户提交的回答' },
          referencePoints: { type: 'string', description: '参考答案要点，用分号分隔' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generateQuestion',
      description: '根据技术主题和难度生成一道新的面试题。当需要追问更深层知识或替换当前题目时使用。',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '技术主题，如 Vue 响应式原理、React Hooks' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], description: '难度' },
          context: { type: 'string', description: '可选，生成题目的背景信息' },
        },
        required: ['topic', 'difficulty'],
      },
    },
  },
]

// ===== 工具执行 =====

async function executeTool(name, args) {
  switch (name) {
    case 'searchKnowledgeBase': {
      const { getEmbedding } = require('./embedding')
      const { search } = require('./vectorStore')
      const [qv] = await getEmbedding([args.query || ''])
      const chunks = await search(qv, { limit: 5 })
      if (!chunks.length) return '知识库中未找到相关内容。'
      return chunks.map((c, i) => `[资料${i + 1}] ${c.text}`).join('\n\n')
    }
    case 'gradeAnswer': {
      const { callAI } = require('./aiCompletions')
      const result = await callAI({
        model: 'deepseek-v4-flash',
        prompt: `你是一位严格的面试官。

【题目】${args.question || ''}

【参考答案要点】${args.referencePoints || '无'}

【用户回答】${args.answer || ''}

请评分（1-10 分）并给出简短反馈。返回 JSON：{"score":数字,"feedback":"评价"}`,
        temperature: 0.3,
        maxTokens: 300,
        logTag: 'agent/grade',
      })
      return typeof result === 'object' ? JSON.stringify(result) : String(result)
    }
    case 'generateQuestion': {
      const { callAI } = require('./aiCompletions')
      const result = await callAI({
        model: 'deepseek-v4-flash',
        prompt: `你是前端面试官。请根据以下信息生成一道面试题。

技术主题：${args.topic || '前端综合'}
难度：${args.difficulty || 'medium'}
参考背景：${args.context || '无'}

要求：题目有区分度，包含参考答案要点。
返回 JSON：{"question":"题目","answerPoints":["要点1","要点2","要点3"]}`,
        temperature: 0.7,
        maxTokens: 500,
        logTag: 'agent/generate-question',
      })
      return typeof result === 'object' ? JSON.stringify(result) : String(result)
    }
    default:
      return `未知工具: ${name}`
  }
}

// ===== 面试评估 =====

/**
 * Agent 驱动的面试评估
 * @param {{ question: string, answerPoints: string[], conversationHistory: Array, kbId?: string, model?: string }} params
 */
async function runInterviewEvaluate({
  question,
  answerPoints,
  conversationHistory = [],
  kbId,
  model = 'deepseek-v4-pro',
}) {
  const pointsText = Array.isArray(answerPoints)
    ? answerPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : (answerPoints || '无')

  const historyText = conversationHistory
    .map((m) => `【${m.role === 'user' ? '考生' : '面试官'}】${m.content}`)
    .join('\n\n')
  const roundCount = Math.floor(conversationHistory.length / 2)

  const system = `你是一位资深前端面试官。请对考生进行追问或给出最终评价。

## 题目
${question}

## 参考答案要点
${pointsText}

## 对话历史
${historyText}
（当前已追问 ${roundCount} 轮）

## 可用工具
1. searchKnowledgeBase — 搜索知识库验证答案准确性${kbId ? `（知识库 ID: ${kbId}）` : ''}
2. gradeAnswer — 对考生回答进行专业评分
3. generateQuestion — 当需要深入了解某个子话题时，生成针对性的新问题

## 评估规则
1. 搜索知识库验证答案的正确性
2. 分析完整度、表达清晰度
3. 如果回答充分（覆盖所有要点 + 表达清晰）→ 给出最终评价
4. 如果回答有薄弱点 → 追问。追问应直击盲区，不要泛泛
5. 追问超过 5 轮仍未覆盖要点 → 必须给出最终评价
6. 追问完一道题后如果发现新知识点 → 可用 generateQuestion 出关联题继续深入

## 最终输出格式（必须是纯 JSON）
- 追问: {"action":"follow_up","followUpQuestion":"追问内容","scoreHint":1-10}
- 完成: {"action":"complete","score":1-10,"correctness":1-10,"completeness":1-10,"clarity":1-10,"feedback":"评价","improvedAnswer":"参考答案"}`

  const { text, steps } = await agentLoop({
    tools,
    executeTool,
    model,
    system,
    messages: [
      { role: 'user', content: `请评估考生对"${question}"的回答。${kbId ? `可以先搜索知识库 ${kbId} 获取参考材料。` : ''}最后只输出 JSON。` },
    ],
    maxSteps: 5,
    logTag: 'interview/evaluate',
  })

  // 解析 Agent 输出的 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[agent] 无法解析输出:', text.slice(0, 200))
    return { action: 'complete', score: 5, correctness: 5, completeness: 5, clarity: 5, feedback: '评分异常，请重试', improvedAnswer: '', agentSteps: steps }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.action === 'follow_up') {
      return { action: 'follow_up', followUpQuestion: parsed.followUpQuestion || '请进一步说明。', scoreHint: parsed.scoreHint ?? 5, agentSteps: steps }
    }
    return {
      action: 'complete',
      score: parsed.score ?? 5, correctness: parsed.correctness ?? 5,
      completeness: parsed.completeness ?? 5, clarity: parsed.clarity ?? 5,
      feedback: parsed.feedback || '暂无评价', improvedAnswer: parsed.improvedAnswer || '',
      agentSteps: steps,
    }
  } catch {
    console.error('[agent] JSON 解析失败:', text.slice(0, 200))
    return { action: 'complete', score: 5, correctness: 5, completeness: 5, clarity: 5, feedback: '评分解析异常', improvedAnswer: '', agentSteps: steps }
  }
}

module.exports = { runInterviewEvaluate, agentGenerateQuestions, reindexKB }

/**
 * Agent 驱动的知识库出题
 * 先搜知识库了解内容范围，再有针对性地出题
 */
async function agentGenerateQuestions({ kbId, count = 5, difficulty = 'medium', model = 'deepseek-v4-pro' }) {
  const qTools = [
    {
      type: 'function',
      function: {
        name: 'searchKnowledgeBase',
        description: '搜索知识库中的文档内容，了解有哪些知识点可以出题',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    },
  ]

  async function qExecuteTool(name, args) {
    if (name === 'searchKnowledgeBase') {
      const { getEmbedding } = require('./embedding')
      const { search } = require('./vectorStore')
      const [qv] = await getEmbedding([args.query || ''])
      const chunks = await search(qv, { kbId, limit: 10 })
      if (!chunks.length) return '知识库中暂无内容'
      return chunks.map((c, i) => `[资料${i + 1}] ${c.text}`).join('\n\n')
    }
    return '未知工具'
  }

  const { text } = await agentLoop({
    tools: qTools,
    executeTool: qExecuteTool,
    model,
    system: `你是专业面试官。请基于知识库内容生成面试题。

流程：
1. 先 searchKnowledgeBase 搜索不同方向的知识点，全面了解知识库覆盖范围
2. 根据搜索结果，生成 ${count} 道${difficulty === 'all' ? '难度均匀分布（简单:中等:困难≈4:4:2）' : difficulty}的面试题

返回 JSON 数组，每道题格式：
{"type":"concept","category":"领域","difficulty":"easy|medium|hard","tags":[],"knowledgePoints":[],"question":"题目","answerPoints":["要点"]}
仅返回 JSON 数组。`,
    messages: [{ role: 'user', content: `请基于知识库 ${kbId} 生成 ${count} 道面试题，难度${difficulty}。先搜索知识库了解内容。` }],
    maxSteps: 5,
    logTag: 'agent/generate-questions',
  })

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return { questions: [], error: 'Agent 题目生成失败' }

  try {
    const questions = JSON.parse(jsonMatch[0])
    if (!Array.isArray(questions)) return { questions: [], error: '生成结果格式异常' }
    return {
      questions: questions.map((q, i) => ({
        id: `ag-${Date.now()}-${i}`,
        type: q.type || 'concept',
        category: q.category || 'custom',
        difficulty: q.difficulty || 'medium',
        tags: Array.isArray(q.tags) ? q.tags : [],
        knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
        question: q.question || '',
        answerPoints: Array.isArray(q.answerPoints) ? q.answerPoints : [],
      })),
    }
  } catch {
    return { questions: [], error: '题目 JSON 解析失败' }
  }
}

/**
 * 重新索引知识库（重新切块 + embedding + 入库）
 */
async function reindexKB(kbId) {
  const fs = require('fs/promises')
  const path = require('path')
  const { chunkText } = require('./chunker')
  const { getEmbedding } = require('./embedding')
  const { addChunks, deleteByKB } = require('./vectorStore')

  const kbDir = path.join(__dirname, '..', 'data', 'knowledge', kbId)
  const metaPath = path.join(kbDir, 'meta.json')

  let meta
  try { meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) } catch { return { error: '知识库不存在' } }

  const files = meta.files || []
  if (!files.length) return { error: '知识库中没有文件' }

  // 清旧向量
  await deleteByKB(kbId)

  let totalChunks = 0
  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(kbDir, 'files', `${file.id}.txt`), 'utf-8')
      const chunks = chunkText(content, { chunkSize: 500, overlap: 100 })
      if (!chunks.length) continue
      const vectors = await getEmbedding(chunks)
      await addChunks(chunks.map((text, i) => ({
        vector: vectors[i], text,
        id: `chunk-${file.id}-${i}`, kbId, fileId: file.id,
      })))
      totalChunks += chunks.length
    } catch (e) {
      console.error(`[agent] 重新索引文件 ${file.id} 失败:`, e.message)
    }
  }

  return { success: true, files: files.length, chunks: totalChunks }
}
