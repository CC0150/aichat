# RAG + Agent 学习指南

> 基于你的项目（Vue 3 + Express + DeepSeek API）编写。全部用 JavaScript 实现，不需要 Python。
> 学习时间：每天 6 小时，3 天学完概念 + 动手跑通。

---

## 目录

- [第一部分：RAG 概念](#第一部分rag-概念)
- [第二部分：Agent 概念](#第二部分agent-概念)
- [第三部分：JS 工具与代码实现](#第三部分js-工具与代码实现)
- [第四部分：面试高频问题与回答思路](#第四部分面试高频问题与回答思路)
- [第五部分：学习路线图](#第五部分学习路线图)

---

## 第一部分：RAG 概念

### 1.1 RAG 是什么

**RAG = Retrieval-Augmented Generation（检索增强生成）**

不是让模型变得更聪明，而是在生成答案之前，先帮模型找到相关信息。解决三个问题：

| 问题 | 说明 | 你项目里的例子 |
|------|------|-------------|
| **知识截断** | 模型 context window 有限，无法塞入全部文档 | `knowledge.js` 第 268 行：`MAX_CONTENT = 10000`，超过直接砍掉 |
| **知识过时** | 模型训练数据有截止日期 | 比如 Vue 3.5 新特性，模型不知道 |
| **私有知识** | 公司内部文档、个人笔记，模型没学过 | 你的知识库里的面试题资料 |

**本质**：在正确的时间给模型正确的信息，而不是把所有信息一股脑塞进去。

---

### 1.2 RAG 完整链路

```
┌─────────────────────────────────────────────────────┐
│  入库阶段（文件上传时执行一次）                         │
│                                                      │
│  PDF/Word/TXT → 提取纯文本 → 切块(chunking)            │
│        → 每块调 Embedding API 生成向量                  │
│        → 向量 + 原文存入向量数据库                       │
│                                                      │
│  查询阶段（用户每次提问时执行）                          │
│                                                      │
│  用户问题 → 调 Embedding API 生成问题向量               │
│        → 向量数据库检索 top-K 个最相似的块               │
│        → 把块的原文拼进 System Prompt                  │
│        → 调 LLM 生成回答                               │
└─────────────────────────────────────────────────────┘
```

**关键理解**：入库只做一次，查询每次都做。Embedding 是桥梁——入库和查询必须用同一个模型，向量才能在同一空间里比较。

---

### 1.3 Embedding 是什么

把一段文本变成一个固定长度的数字数组（向量）。**语义相似的文本，向量在空间里距离更近。**

举例：

```
A: "Vue 的响应式原理"        → [0.12, -0.34, 0.58, ...]  （1024 个 float）
B: "Vue 数据双向绑定怎么实现"  → [0.11, -0.32, 0.55, ...]
C: "CSS 盒模型是什么"          → [-0.45, 0.78, -0.23, ...]

A 和 B 的 cosine similarity ≈ 0.92  （很高，语义相近）
A 和 C 的 cosine similarity ≈ 0.15  （很低，完全无关）
```

**cosine similarity** = 两个向量夹角的余弦值，范围 [-1, 1]

- 1 = 方向完全相同（语义完全相同）
- 0 = 正交（无关）
- -1 = 方向完全相反

RAG 里只用 0~1 这段：越接近 1 越相关。

**你需要做的**：调 Embedding API，把文本传进去，拿到一个浮点数数组。不需要手算相似度（LanceDB 帮你做了）。不需要理解数学原理。

---

### 1.4 向量数据库

存向量 + 做**近似最近邻（ANN）搜索**。不是 MySQL 的 `WHERE id = 1`（等值查询），而是"找出和这个向量最接近的 K 个向量"。

为什么不能遍历算距离？
- 10 万条数据 × 1024 维 × 逐个算 cosine similarity = 太慢
- ANN 用索引结构（比如 IVF、HNSW）快速定位到"附近区域"，近似但很快

你要用的 **LanceDB**：
- npm 包 `@lancedb/lancedb`
- 数据存在本地文件夹，和你的 `server/data/knowledge/` 一样
- API 就 4 个方法

---

### 1.5 分块策略（Chunking）

**为什么不能把整篇文档做成一个向量？**
- 5 万字的文档压成 1024 维向量 → 信息被压得太密，检索精度极低
- 用户问的是某个具体技术点，只需要 500 字，不需要全文

**三个核心参数**：

| 参数 | 含义 | 推荐值 | 为什么 |
|------|------|--------|--------|
| **chunk size** | 每块多大 | 500 字符 | 太大噪音多，太小语义断 |
| **overlap** | 相邻块重叠多少 | 100 字符（20%） | 关键信息落在边界上时，至少有一块完整 |
| **切分策略** | 在哪下刀 | 句号/换行处 | 保证每块的语义完整，不截断句子 |

**overlap 为什么重要**：

```
没有 overlap：  [块1: ...Vue 响应式原] [块2: 理基于 Proxy...]
                ↑ 关键信息被截断，两块都检索不到

有 overlap：    [块1: ...Vue 响应式原理基于 Proxy...]
                     [块2: 原理基于 Proxy，当数据变化时...]
                ↑ 关键信息在块2里是完整的
```

---

### 1.6 检索质量的三个层次

```
Level 1: 纯向量检索（你的起步方案）
  └─ 问题：可能召回到"向量相似但语义不相关"的内容

Level 2: 向量检索 + Rerank（加精排模型）
  └─ 粗排召回 20 条 → Rerank 精排保留 top 5
  └─ 提升准确率

Level 3: 混合检索（向量 + BM25 关键词）
  └─ 向量擅长语义匹配，BM25 擅长专有名词/代码
  └─ 互补
```

面试时能说出这三个层次，并说"当前项目用 Level 1，因为知识库规模小够用"，面试官就知道你懂。

---

### 1.7 RAG 常见失败场景与应对

| 问题 | 原因 | 应对 |
|------|------|------|
| 检索到不相关内容 | 向量相似 ≠ 语义相关 | 增大 top-K，加 Rerank |
| 漏掉关键信息 | chunk 太小或刚好在边界 | 调整 chunk size 和 overlap |
| 模型无视检索内容 | prompt 里检索内容位置不对 | 放 system prompt 末尾，加"必须基于以上资料" |
| 被错误检索结果带偏 | 召回了包含错误信息的文档 | 显示引用来源，让用户能溯源 |

---

### 1.8 RAG vs 微调（面试经典题）

| | RAG | 微调 |
|------|-----|------|
| **做什么** | 为模型提供外部知识 | 改变模型本身的行为 |
| **知识更新** | 改文档即可，即时生效 | 需要重新训练 |
| **可溯源** | 可以看到引用了哪段原文 | 不可溯源 |
| **成本** | Embedding API + 向量库存储 | 训练算力成本高 |
| **适合** | 知识问答、客服、面试 | 学习特定风格/格式 |

> 面试回答："如果你的知识需要频繁更新，或者需要溯源，选 RAG。如果你想让模型学会某种推理方式或输出格式，选微调。两者不互斥，很多生产系统是 RAG + 微调一起用。"

---

## 第二部分：Agent 概念

### 2.1 Agent 是什么

**Agent = LLM + 工具 + 决策循环**

```
普通 LLM 调用：  用户提问 → 模型回答 → 结束
Agent 调用：     用户提问 → 模型思考 → 需要更多信息？→ 调工具 →
                 拿到结果 → 还需要更多？→ 再调工具 →
                 够了 → 输出最终答案
```

你项目里已有的雏形——`server/routes/interview.js` 的 `/evaluate` 接口：

```
现在（伪 Agent）：  硬编码最多 3 轮追问，AI 只决定"追不追"
Agent 化之后：      AI 自己决定追问几轮、追问什么方向、
                   要不要先搜知识库再追问
```

---

### 2.2 ReAct 模式（核心范式）

**Re**asoning + **Act**ing = ReAct。所有 tool-use agent 的底层都是这个循环。

以你项目的面试官场景为例：

```
用户: "帮我出一套 Vue 面试题"

Round 1:
  Thought: 用户要 Vue 题，先搜知识库看看有哪些 Vue 文档
  Action: search_knowledge_base(query="Vue 核心概念")
  Observation: [返回 5 个文档块：响应式原理、虚拟DOM、组件通信]

Round 2:
  Thought: 覆盖了 3 个方向，可以各出一道中等难度的题
  Action: generate_question(topic="响应式原理", difficulty="medium")
  Observation: [生成了题目1]

Round 3:
  Thought: 继续出第二道
  Action: generate_question(topic="虚拟DOM", difficulty="medium")
  Observation: [生成了题目2]

Round 4:
  Thought: 最后一道
  Action: generate_question(topic="组件通信", difficulty="medium")
  Observation: [生成了题目3]

Round 5:
  Thought: 三道题齐全了，整理输出
  Final Answer: 3 道题目 + 知识点覆盖说明
```

**每轮都是一个独立的 LLM 调用**，模型决定：继续调工具，还是输出结果。

---

### 2.3 Tool Calling 协议

你告诉模型"你能用哪些工具"，模型返回"我要用这个，参数是这些"。你执行函数，结果塞回去。

**完整流程（4 步）**：

```
步骤 1：你定义工具（JSON Schema 格式）
{
  name: 'search_knowledge_base',
  description: '从知识库搜索相关内容',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' }
    },
    required: ['query']
  }
}

步骤 2：调用 LLM 时带上 tools 数组
模型返回:
{
  role: 'assistant',
  content: null,                    // 调工具时可能没有文本
  tool_calls: [{
    id: 'call_abc123',
    function: {
      name: 'search_knowledge_base',
      arguments: '{"query":"Vue响应式原理"}'   // JSON 字符串
    }
  }]
}

步骤 3：你执行函数
执行结果: "找到了 5 条相关文档..."

步骤 4：结果塞回 messages，再调模型
{
  role: 'tool',
  tool_call_id: 'call_abc123',      // 必须对应步骤2的 id
  content: '找到了 5 条相关文档...'   // 函数返回值转字符串
}

模型拿到结果后继续：可能再调一个工具，或者生成最终回答
```

**关键点**：
- `tool_call_id` 必须匹配，模型靠它知道"这个结果是哪个调用的返回值"
- 模型可能一次调用多个工具（`tool_calls` 是数组）
- Vercel AI SDK 帮你做了步骤 2-4 的循环，但底层的消息格式要理解

---

### 2.4 Agent 的三类记忆

| 类型 | 存什么 | 存在哪 | 生命周期 | 类比 |
|------|--------|--------|---------|------|
| **短期记忆** | 当前对话的 messages 数组 | 内存 | 单次会话 | 你正在聊的这段对话 |
| **工作记忆** | 工具调用的中间结果 | messages 里的 tool 消息 | Agent 单次任务 | 你为了解决当前问题查的资料 |
| **长期记忆** | 用户偏好、历史面试记录 | 向量库或数据库 | 持久化 | 你知道这个用户擅长 Vue 不擅长 CSS |

**在你项目里的体现**：
- 短期记忆：`chatStore.messagesByChatId`
- 工作记忆：Agent 循环里 tool 角色的消息
- 长期记忆：可以复用 RAG 向量库，存用户面试历史摘要

---

### 2.5 多 Agent 协作模式（了解即可）

| 模式 | 结构 | 例子 |
|------|------|------|
| **Orchestrator-Worker** | 一个"老板" Agent 分配任务给多个"员工" Agent | 面试官总控 → 出题 Agent + 评分 Agent + 搜知识库 Agent |
| **Sequential** | A 的输出是 B 的输入，流水线 | 出题 → 用户答题 → 评分 → 生成报告 |
| **Debate** | 多个 Agent 互相质疑，取共识 | 不适合你项目，跳过 |

校招阶段只需了解 Orchestrator-Worker。面试时能说出"我把面试流程拆成出题 Agent + 评分 Agent，由一个总控调度"就够了。

---

### 2.6 Agent 防呆设计

| 机制 | 做什么 | 代码体现 |
|------|--------|---------|
| **maxSteps** | 循环上限，防止无限循环 | `maxSteps: 10` |
| **Tool choice 约束** | auto（自己决定）/ none（禁止）/ required（必须调）| 默认 `auto` |
| **参数校验** | 模型返回的 arguments 是 JSON 字符串，先 parse 再校验 | handler 里 `try-catch` |
| **工具返回截断** | 工具返回过长会撑爆 context | `result.slice(0, 1000)` |
| **超时控制** | 整个 Agent 运行超时就终止 | `AbortController` + timeout |

**面试时主动说出来，证明你不仅实现了，还处理了边界。**

---

### 2.7 什么时候不该用 Agent

> Agent 是多步决策循环，有开销。单次 LLM 调用能解决的，不需要 Agent。

| 场景 | 用什么 | 理由 |
|------|--------|------|
| 给一道题打分 | 单次 `callAI()` | 确定性任务，输入→输出 |
| 知识库搜一段内容回答 | RAG 单次查询 | 不需要决策 |
| 面试官完整流程：出题→追问→评分 | **Agent** | 需要多步决策 |
| 用户说"你好" | 普通 chat | 零工具调用 |

> 面试回答："过度使用 Agent 会增加延迟、token 消耗和出错概率。单次调用能解决的用 Agent 是浪费。"

---

### 2.8 Agent 评估标准

| 指标 | 含义 |
|------|------|
| **任务完成率** | Agent 有没有最终完成用户的要求 |
| **工具选择准确率** | 该搜知识库时没有乱调其他工具 |
| **平均调用轮次** | 越少越好（但不能少到跳过必要步骤） |
| **死循环率** | 是否掉入反复调同一个工具的循环 |

---

## 第三部分：JS 工具与代码实现

### 3.1 Embedding API

**用硅基流动（SiliconFlow）**，因为 DeepSeek 目前没有专用的 Embedding 模型。

注册地址：https://siliconflow.cn ，新建 API Key。

```js
// server/services/embedding.js
const EMBEDDING_BASE_URL = 'https://api.siliconflow.cn/v1'
const EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5'  // 中文效果好，1024 维

async function embed(texts) {
  const res = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  })
  if (!res.ok) throw new Error(`Embedding 失败: ${res.status}`)
  const json = await res.json()
  return json.data.map(d => d.embedding)  // 每个都是 1024 个 float 的数组
}

module.exports = { embed }
```

**验证**：在终端跑一次 curl，看到返回的 1024 个 float 就通了。

```bash
curl https://api.siliconflow.cn/v1/embeddings \
  -H "Authorization: Bearer sk-你的key" \
  -H "Content-Type: application/json" \
  -d '{"model":"BAAI/bge-large-zh-v1.5","input":["Vue响应式原理"]}'
```

---

### 3.2 文本分块函数

先看简化版理解核心逻辑，再看生产版增强。

**简化版（理解原理）**：

```js
function chunkText(text, { chunkSize = 500, overlap = 100 } = {}) {
  const chunks = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)

    if (end < text.length) {
      const slice = text.slice(start, end)
      const match = slice.match(/.*[。\n]/)   // 找最近的完整句
      if (match) end = start + match[0].length
    }

    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)

    start = end - overlap
    if (start >= text.length - 1) break       // 防死循环
  }

  return chunks
}
```

**逻辑就是**：从 0 开始取 500 字 → 往前找最近的句号 → 切下 → 后退 100 字 → 继续。

**生产版（你项目实际用的，面试能展开讲）**：

```js
// server/services/chunker.js

/**
 * 滑动窗口 + 语义边界回退策略：
 * 从当前位置取 chunkSize 个字符，往回找最近的语义断点（句号、换行等），
 * 在断点处切割。相邻块之间保留 overlap 重叠。
 *
 * @param {string}  text
 * @param {{ chunkSize?: number, overlap?: number }} opts
 * @returns {string[]}
 */
function chunkText(text, { chunkSize = 512, overlap = 80 } = {}) {
  if (typeof text !== 'string' || text.trim().length === 0) return []

  // 归一化：合并多个连续空行
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  // 短文本直接返回
  if (text.length <= chunkSize) return [text]

  // 断点优先级：句末标点 > 换行 > 分号 > 逗号
  const BOUNDARY_RE = /[。！？\n.!?;；，,]/g

  const chunks = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)

    // 最后一段直接收尾
    if (end >= text.length) {
      const chunk = text.slice(start).trim()
      if (chunk) chunks.push(chunk)
      break
    }

    // 在窗口内找最后一个语义断点（最多退回 chunkSize 的 30%）
    const searchStart = Math.max(start, end - Math.floor(chunkSize * 0.3))
    const window = text.slice(searchStart, end)

    // 找窗口内最后一个匹配的断点
    let lastBoundary = -1
    let match
    BOUNDARY_RE.lastIndex = 0
    while ((match = BOUNDARY_RE.exec(window)) !== null) {
      lastBoundary = match.index
    }

    if (lastBoundary !== -1) {
      end = searchStart + lastBoundary + 1   // 在断点后切割（包含标点）
    }
    // 找不到断点 → 硬切在 chunkSize，避免死循环

    const chunk = text.slice(start, end).trim()
    if (chunk) chunks.push(chunk)

    const nextStart = end - overlap
    if (nextStart <= start || nextStart >= text.length) break  // 防死循环

    start = nextStart
  }

  return chunks
}

module.exports = { chunkText }
```

**简化版 vs 生产版，多了三个面试能说的增强**：

| 增强 | 做什么 | 为什么 |
|------|--------|--------|
| **30% 回退限制** | 只在窗口尾部 30% 范围内找断点 | 如果整段都没标点，不会一直退到 0 导致块太小 |
| **找最后一个断点** | `exec` 遍历完取 `lastBoundary`，而非 `match()` 找第一个 | 尽量让每块接近 chunkSize，而不是一遇到标点就切 |
| **死循环双重防护** | `nextStart <= start` + `nextStart >= text.length` | 防止 overlap 设得比 chunk 还大导致窗口倒退

---

### 3.3 向量存储（LanceDB）

```bash
npm install @lancedb/lancedb
```

**注意**：包名是 `@lancedb/lancedb`，不是 `vectordb`（已废弃）。`apache-arrow` 作为 LanceDB 的依赖会自动安装，不需要额外装。

```js
// server/services/vectorStore.js
const lancedb = require('@lancedb/lancedb')
const arrow = require('apache-arrow')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', 'data', 'vectors')

// 单例缓存（避免每次请求重新连接）
let db = null
let table = null

const TABLE_NAME = 'chunks'
const VECTOR_DIM = 1024  // bge-large-zh-v1.5 输出维度

// ===== 内部 =====

async function getDB() {
  if (!db) db = await lancedb.connect(DB_PATH)
  return db
}

/**
 * Arrow Schema —— 显式定义每列的名称和类型
 * 这是标准写法，不需要「塞占位数据 → 推断 → 删占位行」那种 hack
 */
function getSchema() {
  return new arrow.Schema([
    new arrow.Field('vector', new arrow.FixedSizeList(VECTOR_DIM, new arrow.Field('item', new arrow.Float32()))),
    new arrow.Field('text', new arrow.Utf8()),
    new arrow.Field('id', new arrow.Utf8()),
    new arrow.Field('kbId', new arrow.Utf8()),
    new arrow.Field('fileId', new arrow.Utf8()),
  ])
}

// ===== 公开 API =====

/**
 * 初始化或获取 chunks 表
 * 首次调用用 Arrow schema 创建空表，后续直接打开
 */
async function getTable() {
  if (table) return table

  const database = await getDB()
  const names = await database.tableNames()

  if (!names.includes(TABLE_NAME)) {
    table = await database.createEmptyTable(TABLE_NAME, getSchema())
  } else {
    table = await database.openTable(TABLE_NAME)
  }

  return table
}

/**
 * 批量存入向量
 * @param {Array<{ vector: number[], text: string, id: string, kbId: string, fileId: string }>} rows
 */
async function addChunks(rows) {
  if (!rows || rows.length === 0) return
  const t = await getTable()
  await t.add(rows)
}

/**
 * 检索最相似的 K 个块
 * @param {number[]} queryVector - 查询向量
 * @param {{ kbId?: string, fileId?: string, limit?: number }} opts
 * @returns {Promise<Array<{ text: string, id: string, kbId: string, _distance: number }>>}
 */
async function search(queryVector, { kbId, fileId, limit = 5 } = {}) {
  const t = await getTable()
  let query = t.search(queryVector).limit(limit)
  // kbId / fileId 由服务端生成（UUID），不存在注入风险
  if (kbId) query = query.where(`kbId = "${kbId}"`)
  if (fileId) query = query.where(`fileId = "${fileId}"`)
  return query.toArray()
}

/**
 * 删除指定知识库的所有向量
 */
async function deleteByKB(kbId) {
  const t = await getTable()
  await t.delete(`kbId = "${kbId}"`)
}

/**
 * 删除指定文件的所有向量
 */
async function deleteByFile(fileId) {
  const t = await getTable()
  await t.delete(`fileId = "${fileId}"`)
}

/**
 * 获取 chunk 总数
 */
async function count() {
  const t = await getTable()
  return t.countRows()
}

module.exports = { getTable, addChunks, search, deleteByKB, deleteByFile, count }
```

**6 个方法就是**：`connect` → `createEmptyTable`/`openTable` → `add` → `search` → `delete` → `countRows`。没有更多了。

| 方法 | 一句话 |
|------|--------|
| `connect` | 连接/创建数据库（目录不存在自动建） |
| `createEmptyTable` + Arrow Schema | **标准建表方式**，不需要占位行 hack |
| `openTable` | 打开已有表 |
| `add` | 批量插入行 |
| `search + where + toArray` | 向量检索 + 过滤 → JS 数组 |
| `delete` | 按条件删除行 |
| `countRows` | 行数统计 |

---

### 3.4 RAG 查询（串联上面所有步骤）

```js
// server/services/rag.js
// 注意：import 名称必须跟你 embedding.js 实际导出的函数名一致
// 文档 §3.1 示例叫 embed，但你项目的 embedding.js 导出的是 getEmbedding
const { getEmbedding } = require('./embedding')
const { search } = require('./vectorStore')
const { streamChat } = require('./deepseek')

/**
 * RAG 流式查询
 * @param {string} userQuery - 用户问题
 * @param {{ kbId?: string, model?: string }} opts
 * @returns {AsyncGenerator<string>}
 */
async function* ragQuery(userQuery, { kbId, model = 'deepseek-v4-pro' } = {}) {
  // Step 1: 把问题变成向量
  const [queryVector] = await getEmbedding([userQuery])

  // Step 2: 向量检索
  const chunks = await search(queryVector, { kbId, limit: 5 })

  // Step 3: 拼接上下文
  const context = chunks
    .map((c, i) => `[资料${i + 1}] ${c.text}`)
    .join('\n\n---\n\n')

  const systemPrompt = `你是一个专业的面试辅导助手。请基于以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请如实告知用户，不要编造。

===== 参考资料 =====
${context}
===================

回答要求：
- 基于参考资料，如果没有相关信息就如实说
- 回答准确、简洁
- 如果能引用具体的资料段落，请在回答中注明`

  // Step 4: 流式生成（复用你现有的 streamChat）
  yield* streamChat(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery }
  ])
}

module.exports = { ragQuery }
```

**接入 Express 路由（胶水代码）**：

```js
// server/routes/rag.js  （新建）
const express = require('express')
const router = express.Router()
const { writeSSEHeaders } = require('../middleware')
const { ragQuery } = require('../services/rag')

router.post('/search', async (req, res) => {
  const { query, kbId } = req.body
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query 不能为空' })
  }

  writeSSEHeaders(res)

  try {
    for await (const chunk of ragQuery(query, { kbId })) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
    }
    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

module.exports = router
```

然后在 `server/routes/index.js` 中挂载：

```js
app.use('/api/rag', require('./rag'))
```

这样 `ragQuery` 就能被前端调用了：`POST /api/rag/search`，SSE 流式返回。

---

### 3.5 Agent 实现（Vercel AI SDK）

```bash
npm install ai @ai-sdk/deepseek zod
```

**注意**：用 `@ai-sdk/deepseek`（DeepSeek 官方 provider），**不是** `@ai-sdk/openai`。`@ai-sdk/openai` v4 默认调 OpenAI Responses API（`/v1/responses`），DeepSeek 不支持，会 404。官方 provider 走的是 Chat Completions API，兼容性没问题。

| 方案 | 做法 | 适合 |
|------|------|------|
| 动态 `import()`（推荐） | 在函数内部 `await import(...)` | Agent 文件少、在路由里引用 |
| `.mjs` 文件 | Agent 文件用 `.mjs` 后缀 | Agent 代码独立、不被 CJS 文件 require |
| 全局改 ESM | `package.json` 加 `"type": "module"` | 一劳永逸，但改动大 |

**本项目推荐**：Agent 核心文件用 `.mjs`（`server/services/agent.mjs`），路由里用动态 `import()` 引入。其他文件保持 CJS 不动。

另外注意：`import()` 有**模块缓存**——同一个模块多次 `import()` 只会加载一次，不用担心每次都重新加载。但把 `import` 放在 `execute` 内部可读性差，更好的做法是提到文件顶部用动态 import 并缓存引用。

```js
// server/services/agent.mjs
import { generateText, streamText, tool } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { z } from 'zod'

const deepseek = createDeepSeek({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY
})

// ===== 定义工具 =====

// 顶层缓存引用（避免每次调工具都执行 import，虽然 import() 有缓存但可读性更好）
let _embed, _search, _callAI
async function getServices() {
  if (!_embed) {
    ;({ getEmbedding: _embed } = await import('../services/embedding.js'))
    ;({ search: _search } = await import('../services/vectorStore.js'))
    ;({ callAI: _callAI } = await import('../services/aiCompletions.js'))
  }
  return { embed: _embed, search: _search, callAI: _callAI }
}

const searchKnowledgeBase = tool({
  description: '从知识库中搜索相关文档内容。当需要查找特定技术知识、面试题素材时使用。',
  parameters: z.object({
    query: z.string().describe('搜索关键词或问题')
  }),
  execute: async ({ query }) => {
    const { embed, search } = await getServices()
    const [qv] = await embed([query])
    const chunks = await search(qv, { limit: 5 })
    return chunks.map(c => c.text).join('\n\n')
  }
})

const generateInterviewQuestion = tool({
  description: '根据指定的技术主题和难度生成一道面试题',
  parameters: z.object({
    topic: z.string().describe('技术主题，如 Vue、React、JavaScript'),
    difficulty: z.enum(['easy', 'medium', 'hard']).describe('难度级别')
  }),
  execute: async ({ topic, difficulty }) => {
    const { callAI } = await getServices()
    return callAI({
      model: 'deepseek-v4-flash',
      prompt: `生成一道关于${topic}的${difficulty}难度前端面试题。
返回JSON格式：{"question":"问题","answerPoints":["要点1","要点2"]}`,
      temperature: 0.7,
      maxTokens: 500
    })
  }
})

const gradeAnswer = tool({
  description: '对用户的回答进行评分，返回分数和反馈',
  parameters: z.object({
    question: z.string().describe('原问题'),
    answer: z.string().describe('用户的回答'),
    referencePoints: z.array(z.string()).describe('参考答案要点')
  }),
  execute: async ({ question, answer, referencePoints }) => {
    const { callAI } = await getServices()
    return callAI({
      model: 'deepseek-v4-flash',
      prompt: `题目：${question}\n参考答案：${referencePoints.join('；')}\n用户回答：${answer}\n请评分(1-10)并给出简短反馈。返回JSON：{"score":数字,"feedback":"反馈"}`,
      temperature: 0.3,
      maxTokens: 300
    })
  }
})

// ===== Agent 核心 =====

const SYSTEM_PROMPT = `你是一个专业的 AI 面试官助手。你可以使用以下工具来帮助用户：

1. searchKnowledgeBase - 搜索知识库获取技术知识
2. generateInterviewQuestion - 生成面试题
3. gradeAnswer - 对回答进行评分

工作流程参考：
- 用户要求出题时，先 searchKnowledgeBase 了解相关知识范围，再 generateInterviewQuestion
- 用户要求评分时，使用 gradeAnswer
- 给出建议时先 searchKnowledgeBase 获取准确信息`

/**
 * 非流式 Agent（适合评分、出题等场景）
 */
async function runAgent(userMessage, history = []) {
  const result = await generateText({
    model: deepseek('deepseek-v4-pro'),
    system: SYSTEM_PROMPT,
    messages: history,
    prompt: userMessage,
    tools: { searchKnowledgeBase, generateInterviewQuestion, gradeAnswer },
    maxSteps: 10   // 最多 10 轮 tool calling
  })

  return {
    text: result.text,
    steps: result.steps?.map(s => ({
      type: s.toolCalls?.length ? 'tool_call' : 'text',
      toolCalls: s.toolCalls,
      text: s.text
    }))
  }
}

/**
 * 流式 Agent（适合聊天场景）
 */
async function* runAgentStream(userMessage, history = []) {
  const result = streamText({
    model: deepseek('deepseek-v4-pro'),
    system: SYSTEM_PROMPT,
    messages: history,
    prompt: userMessage,
    tools: { searchKnowledgeBase, generateInterviewQuestion, gradeAnswer },
    maxSteps: 10
  })

  for await (const chunk of result.textStream) {
    yield { type: 'text', content: chunk }
  }
}

export { runAgent, runAgentStream }
```

---

### 3.6 接入知识库上传流程

在你现有的 `server/routes/knowledge.js` 中，文件上传成功后增加入库操作：

```js
// 在 writeFileContent() 调用之后插入：

const { chunkText } = require('../services/chunker')
const { getEmbedding } = require('../services/embedding')
const { addChunks } = require('../services/vectorStore')

// 分块 + Embedding + 存入向量库
// 注意：chunkSize/overlap 与 chunker.js 默认值（512/80）不同，
// 知识库场景推荐 500/100（20% 重叠），中文 embedding 模型在这个粒度效果最好
const chunks = chunkText(content, { chunkSize: 500, overlap: 100 })
const vectors = await getEmbedding(chunks)
await addChunks(chunks.map((text, i) => ({
  vector: vectors[i],
  text,
  id: `chunk-${fileId}-${i}`,
  kbId: id
})))
```

**文件删除时同步清理向量**：

在 `DELETE /api/knowledge/:id/files/:fileId` 里，删除文件后要同步删向量，否则向量库会残留脏数据：

```js
// 在 knowledge.js 删除文件路由中，unlink 之后插入：
const { deleteByKB } = require('../services/vectorStore')

// 方案 A：删除整个知识库时调（已有接口）
await deleteByKB(kbId)

// 方案 B：删除单个文件时，需要新增按 fileId 删除的方法
// 在 vectorStore.js 中加：
async function deleteByFileId(fileId) {
  const table = await getTable()
  await table.delete(`id LIKE "chunk-${fileId}-%"`)
}
await deleteByFileId(fileId)
```

> **为什么不能只删文件不删向量？** 向量库和文件系统是两份独立数据。文件删了但向量还在 → 用户搜索时会召回到"幽灵文档"（向量说匹配但原文已经不存在了）。

---

## 第四部分：面试高频问题与回答思路

### Q1：你为什么用 RAG，不用微调？

> "我的知识库内容频繁更新，RAG 可以即时生效不需要重训。而且面试场景需要可溯源——用户能看到回答引用了哪段资料。微调适合学习风格或格式，不适合动态知识库。两者不互斥，生产环境经常一起用。"

### Q2：你的分块策略怎么定的？chunk size 和 overlap 为什么是这个值？

> "我用 500 字 + 100 重叠。500 字是中文 embedding 模型 BGE 的建议范围——太大噪音多、太小语义不完整。100 字重叠是为了防止关键信息刚好落在分块边界被截断。切分点优先在句号和换行，保证每个 chunk 的语义完整。"

### Q3：Agent 调用工具失败了怎么办？

> "有几层防护。第一层是参数校验：模型返回的 arguments 我 parse 后用 try-catch 包裹。第二层是结果兜底：工具执行失败时返回错误信息给模型，让模型知道'这个工具不可用，换其他方式'。第三层是 maxSteps 上限：Agent 最多跑 10 轮，防止死循环。"

### Q4：什么时候用 Agent，什么时候用普通 LLM 调用？

> "单次确定性的任务用普通调用——比如给一道题打分。需要多步决策、外部信息检索、或者多个依赖子任务的场景用 Agent——比如面试官完整流程：出题→追问→评分。过度使用 Agent 会增加延迟和 token 消耗。"

### Q5：怎么判断你的 RAG 检索质量好不好？

> "评估分两个维度。检索阶段看 Hit Rate——相关文档有没有被召回到 top-K；用 MRR 看相关文档排在什么位置。生成阶段看回答是否准确、有没有引用到正确的资料。如果知识库不大，直接人工抽样检查几组问题的检索结果。"

### Q6：Agent 的三种记忆是什么？你怎么实现的？

> "短期记忆是当前对话的 messages 数组，在内存里。工作记忆是工具调用的中间结果，存在 messages 的 tool 消息里。长期记忆我计划用向量库存用户面试历史摘要——下次面试时检索相关历史，让 Agent 知道用户之前的薄弱点。"

### Q7：RAG 链路中哪个环节最容易出问题？

> "检索环节。向量检索是基于语义相似度，可能返回'向量相近但不相关'的内容。解决方案是：召回 top-K 设大一些（比如 20），再加 Rerank 精排，或者用混合检索（向量 + BM25）互补。"

---

## 第五部分：学习路线图

### 第 1 天：RAG 链路跑通

```
上午（3h）：概念 + Embedding API
  1. 读本文档第一部分 1.1-1.4（1h）
  2. 注册硅基流动，拿 API Key
  3. curl 调一次 Embedding API，看到 1024 个 float（0.5h）
  4. 手写 embedding.js，封装成函数（1h）

下午（3h）：分块 + 向量库 + 全链路
  1. 手写 chunkText()（0.5h）
  2. 装 @lancedb/lancedb，跑通 createEmptyTable → add → search（1h）
  3. 写 rag.js，串联 embed + search + streamChat（1h）
  4. 用一个测试 txt 文件验证整个链路（0.5h）
```

### 第 2 天：Agent 链路跑通

```
上午（3h）：概念 + Tool Calling 协议
  1. 读本文档第二部分 2.1-2.3（1h）
  2. 用 curl 手动调一次 DeepSeek Function Calling（0.5h）
  3. 理解 messages 里 tool_call 和 tool 消息的格式（0.5h）
  4. 读本文档 Agent 防呆 + 边界（2.6-2.8）（1h）

下午（3h）：Vercel AI SDK 动手
  1. 装 ai + @ai-sdk/deepseek + zod
  2. 定义一个简单 tool（比如 getCurrentTime），跑通 tool calling（1h）
  3. 加 2 个你项目的真实工具，跑通完整 Agent（1.5h）
  4. 改成 streamText 流式输出（0.5h）
```

### 第 3 天：在你项目里落地

```
上午（3h）：RAG 接入知识库
  1. 改 knowledge.js：文件上传时触发分块 + embedding + 存向量库
  2. 新增 /api/rag/query SSE 接口
  3. 联调：上传一个 Vue 文档 → 提问 → 看到检索结果拼接后的回答

下午（3h）：Agent 改造面试官
  1. 新建 agent.mjs，定义 3 个工具
  2. 新增 /api/agent/interview 路由
  3. 改造 interview.js 的 evaluate 接口接入 Agent 循环
  4. 前端加"AI 正在搜索知识库..."中间状态
```

---

## 关键注意事项

1. **DeepSeek 没有 Embedding API**，用硅基流动替代，模型选 `BAAI/bge-large-zh-v1.5`
2. **LanceDB npm 包名是 `@lancedb/lancedb`**，`vectordb` 已废弃
3. **用 `@ai-sdk/deepseek` 而不是 `@ai-sdk/openai`** — 后者 v4 默认走 OpenAI Responses API，DeepSeek 只支持 Chat Completions
4. **Vercel AI SDK 是 ESM 包**，你的 CommonJS 项目需要 `.mjs` 或动态 `import()`
5. **Agent 的工具定义用 Zod 写 Schema**，比手写 JSON Schema 多了类型安全
6. **硅基流动免费额度有限**，测试时别批量跑几百个文件

---

## 检验标准：能动手的 3 个信号

1. ✅ 亲手用 curl 调通了硅基流动 Embedding API，看到了 1024 个 float
2. ✅ 手写了 `chunkText()` 函数，拿知识库的一个 txt 文件切出了若干块
3. ✅ 用 LanceDB 创建表 → 插入 3 条 → 检索 1 次，看到了返回结果

**三个都做到，就可以往项目里加了。**
