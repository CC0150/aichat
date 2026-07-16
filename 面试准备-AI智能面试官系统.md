# 面试准备：AI 智能面试官系统

> 全栈独立开发 · Vue 3 + Pinia + Express + DeepSeek API + LanceDB
>
> 适用于前端/全栈岗位的项目深挖面试准备

---

## 目录

1. [项目概述（60 秒电梯演讲）](#1-项目概述60-秒电梯演讲)
2. [亮点一：Agent 工具调用引擎](#2-亮点一agent-工具调用引擎)
3. [亮点二：端到端 RAG 管线](#3-亮点二端到端-rag-管线)
4. [亮点三：三级面试评估体系](#4-亮点三三级面试评估体系)
5. [亮点四：虚拟滚动性能优化](#5-亮点四虚拟滚动性能优化)
6. [亮点五：SSE 流式传输工程化](#6-亮点五sse-流式传输工程化)
7. [高频追问清单](#7-高频追问清单)
8. [架构图与数据流](#8-架构图与数据流)

---

## 1. 项目概述（60 秒电梯演讲）

> 我独立开发了一个 AI 智能面试官系统，核心解决了三个问题：
>
> 第一，传统 AI 评分只能一轮定论，我设计了一套 **Agent 工具调用引擎**，让 LLM 能自主搜索知识库、评分、出题，像真实面试官一样判断追问还是结束。
>
> 第二，面试出题需要引用专业知识库，我搭建了**端到端的 RAG 管线**——分块、向量化、LanceDB 存储、语义检索、流式输出，全链路自研。
>
> 第三，前端性能方面，AI 回复长短差异极大，我用虚拟滚动 + ResizeObserver 动态测量 + RAF 节流，200+ 条混合消息流畅滚动，内存降低 80%。

---

## 2. 亮点一：Agent 工具调用引擎

### 2.1 一句话概括

> 实现了一套通用的 LLM + Tool-Use 循环框架，让 AI 从"被动打分"升级为能自主决策的"主动面试官"。

### 2.2 解决了什么问题

| 传统做法 | 问题 |
|---------|------|
| 一次性打分 | AI 无法追问，回答深度不够时只能硬打分 |
| 固定流程 | 不能根据回答质量动态调整评估路径 |
| 无外部知识 | 评分依赖模型记忆，无法引用用户上传的专业资料 |

### 2.3 技术实现

**核心循环**（`server/utils/agentLoop.js`）：

```
┌─────────────────────────────────────────────┐
│  1. LLM 收到系统提示 + 对话历史              │
│  2. LLM 返回 tool_calls 或 纯文本            │
│     ├─ 有 tool_calls → 3                     │
│     └─ 纯文本 → 循环结束，输出结果            │
│  3. 逐个执行工具函数                          │
│  4. 将工具调用结果塞回 messages               │
│  5. 回到步骤 1（最多 maxSteps 轮）            │
└─────────────────────────────────────────────┘
```

**关键代码逻辑**：

```javascript
async function agentLoop({ tools, executeTool, model, system, messages, maxSteps = 10 }) {
  let currentMessages = [{ role: 'system', content: system }, ...messages]

  for (let i = 0; i < maxSteps; i++) {
    const response = await openai.chat.completions.create({
      model, messages: currentMessages, tools, tool_choice: 'auto'
    })

    const msg = response.choices[0].message

    // LLM 直接回复文本 → 结束循环
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { text: msg.content, steps }
    }

    // 执行每个工具调用
    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || '{}')
      const result = await executeTool(tc.function.name, args)
      // 将 assistant 的 tool_call 和 tool 的返回结果都塞回上下文
      currentMessages.push(buildAssistantMessage(msg, tc))
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr })
    }
  }

  // 达到 maxSteps 后强制输出文本
  const finalResp = await openai.chat.completions.create({
    messages: [...currentMessages, { role: 'user', content: '请基于以上工具调用结果给出最终回答' }]
  })
  return { text: finalResp.choices[0].message.content, steps }
}
```

**面试场景的三把工具**（`server/services/agent.js`）：

| 工具 | 用途 | 实际执行 |
|------|------|---------|
| `searchKnowledgeBase` | 搜索知识库验证答案 | embed 查询词 → LanceDB 语义检索 → 返回 Top 5 |
| `gradeAnswer` | 专业评分 | 调用 DeepSeek 评分，返回 1-10 分 + 反馈 |
| `generateQuestion` | 深挖子话题 | 根据 topic + difficulty 生成新题 + 答案要点 |

**工具定义示例**（JSON Schema 格式）：

```javascript
{
  type: 'function',
  function: {
    name: 'searchKnowledgeBase',
    description: '从知识库中搜索相关文档内容。当需要验证答案准确性时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，尽量简洁明确' }
      },
      required: ['query']
    }
  }
}
```

### 2.4 设计中踩过的坑与思考

**为什么 tools 是 JSON Schema 而非自然语言描述？**
——OpenAI/DeepSeek 的 function calling 协议要求标准 JSON Schema 格式。模型需要精确的参数类型和必填字段定义才能生成合法的函数调用。

**为什么 maxSteps 设为 5 而非更多？**
——面试场景的追问深度有边界。5 轮 tool calling 通常对应：搜索 KB → 评分 → 追问出题 → 再搜 KB → 再评分/结束。更多轮次反而增加延迟和 token 消耗，且不符合真实面试的追问节奏。

**为什么达到 maxSteps 后要"强制输出文本"而非直接报错？**
——用户体验优先。Agent 可能在中间步骤已经收集了足够信息，只是没来得及输出最终 JSON。追加一条"请给出最终回答"的消息可以让 LLM 基于已有工具结果生成合理评价，而不是白费前面的计算。

**设计原则**：agentLoop 是一个**通用循环**，面试评估只是它的一个调用方。同样的模式还可以用于 KB 出题（`agentGenerateQuestions`），只需换一套 tools 和 system prompt。

### 2.5 面试可能追问

> **Q: Agent 循环和传统的 if-else 流程控制有什么区别？**
>
> A: if-else 是预设路径——"如果分数 < 5 则追问问题 A"。Agent 循环是 LLM **自主决策**——它根据回答的实际薄弱点选择工具，追问方向和深度都是动态的。比如回答在"闭包"上含糊，Agent 可能搜 KB 找闭包相关知识来针对性追问，而不是按预设模板走。

> **Q: 如何防止 Agent 在工具调用中死循环？**
>
> A: 三层防护：① `maxSteps=5` 硬限制；② system prompt 明确"追问超过 5 轮必须给出最终评价"；③ 超限后追加"请给出最终回答"而非报错，保证总有输出。

> **Q: 工具执行中的错误怎么处理？**
>
> A: `executeTool` 中每个 case 都有 try-catch，搜索 KB 失败返回"未找到相关内容"，评分失败返回异常 JSON。工具调用结果始终是合法字符串，不会让 Agent 因工具报错而中断循环。

> **Q: 为什么 Agent 循环不支持流式输出中间步骤？**
>
> A: 这是一个已知的改进点。当前 agentLoop 返回的是 `{ text, steps }`——steps 记录每步调了什么工具，但只在循环结束后一次性返回。理想方案是每一步工具执行结果通过 SSE 实时推给前端，让用户看到"🔍 正在搜索知识库..."→"📊 正在评分..."的过程。技术难点在于 HTTP 响应只能 write 一次——如果走 SSE 流式输出中间步骤，最终的 JSON 结果也需要通过 SSE chunk 传递，前端需要区分"进度消息"和"最终结果"。这正是我下一步计划做的改进。

> **Q: Agent 调用了错误的工具或传了奇怪的参数怎么办？**
>
> A: 分两层：① JSON Schema 约束——参数的 type 和 required 字段限制了 LLM 不能乱传，比如 `searchKnowledgeBase` 的 query 必须是 string；② `executeTool` 内部防御——`JSON.parse(fn.arguments || '{}')` 兜底空对象，即使 LLM 生成了非法 JSON 也不会 crash。但"调用策略错误"（比如应该 gradeAnswer 却调了 generateQuestion）目前没有防护——这本质上是模型推理质量的范畴，通过 prompt 中明确的工具使用指南和 model 选择（用 deepseek-v4-pro 而非 flash）来降低概率。

> **Q: DeepSeek 的 tool calling 和 GPT 的 function calling 有什么差异？**
>
> A: 协议层面兼容 OpenAI，都可以用 `tools` + `tool_choice: 'auto'`。实际使用中两个坑：① DeepSeek 有时会在 tool_calls 的 arguments 中少 required 字段，GPT 更严格遵守 Schema——所以 executeTool 每个参数都要兜底默认值；② DeepSeek 的 v4-pro 模型会返回 `reasoning_content` 字段（思维链），如果下次请求 messages 中不保留这个字段直接报 400 错误——这就是 `buildAssistantMessage` 函数存在的原因，它把 `reasoning_content` 原样携带。

> **Q: 单次 Agent 评估的 token 消耗大概是多少？**
>
> A: 取决于 Agent 实际调用了几步工具。典型路径：system prompt (~800 tokens) + 用户消息 (~100 tokens) + 每步 tool call 的往返（assistant tool_calls ~100 + tool result ~300-500）× 3 步 → 约 2500-3500 input tokens。对比 Level 1 单次评分约 500 tokens，Agent 模式贵 5-7 倍但获得了知识库检索和自主追问能力。这是用成本换深度的 trade-off。

> **Q: 如果让你重新设计 agentLoop，你会怎么改进？**
>
> A: 三点：① 加入流式回调——`onStep(step)` 让调用方能实时拿到每步进度；② 支持工具调用并行——当 LLM 一次性返回多个无关 tool_call 时可以并发执行而非串行；③ 加入 early termination 策略——允许工具返回特殊信号（比如 gradeAnswer 返回 score >= 9 时直接触发完成）跳过剩余步骤，减少不必要的 API 调用。不过后两点在面试场景中作用有限——面试追问本身就是串行逻辑。

> **Q: Agent 如果在 maxSteps 处被强制终结，输出的质量如何保证？**
>
> A: 强制终结时，我在 messages 末尾追加了一条 `"请基于以上工具调用结果，用中文给出最终回答"`。此时 messages 中已经包含了前面所有工具调用的结果（搜索到的 KB 内容、评分结果），LLM 有足够的上下文给出合理结论。实际测试中，强制终结的回答质量与正常结束相比差异不大——因为 Agent 一般在前 3-4 步就完成了核心评估，第 5 步被截断往往是"还想再搜一次但没必要"。如果连续多次在 maxSteps 处终结，说明应该调大上限或优化 prompt 让它更早收敛。

---

## 3. 亮点二：端到端 RAG 管线

### 3.1 一句话概括

> 从零搭建了文档分块 → 向量化 → 向量存储 → 语义检索 → 增强生成的完整链路，让 AI 面试官能引用用户上传的专业资料。

### 3.2 完整数据流

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PDF/Word/   │────▶│  chunkText() │────▶│ getEmbedding │
│  纯文本文件   │     │  500字/块    │     │  BGE 1024维  │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SSE 流式    │◀────│  streamChat  │◀────│ search()     │
│  输出给前端   │     │  + 拼接prompt│     │ LanceDB 检索 │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 3.3 各环节详解

#### 3.3.1 文本分块（`server/services/chunker.js`）

```
输入：原始文本
输出：重叠的文本块数组
```

**策略**：滑动窗口 + 语义边界回退

```javascript
function chunkText(text, { chunkSize = 500, overlap = 100 }) {
  // 1. 归一化：合并多个连续空行
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  // 2. 短文本直接返回
  if (text.length <= chunkSize) return [text]

  const BOUNDARY_RE = /[。！？\n.!?;；，,]/g

  while (start < text.length) {
    let end = start + chunkSize

    // 3. 在窗口后 30% 范围内找最后一个语义断点
    const searchStart = Math.max(start, end - Math.floor(chunkSize * 0.3))
    const window = text.slice(searchStart, end)

    // 4. 句号/换行处切割，找不到则硬切
    let lastBoundary = findLastBoundary(window)
    if (lastBoundary !== -1) end = searchStart + lastBoundary + 1

    chunks.push(text.slice(start, end).trim())

    // 5. overlap 回退：下一块起点 = 当前块结尾 - 100
    start = end - overlap
  }
}
```

**为什么是 500 字 / 100 字重叠？**
- BGE-large-zh-v1.5 模型的最佳输入窗口
- 20% 重叠是业界常用值，RAG 论文中的经验参数
- 太大浪费 token，太小可能切断关键句

**为什么在句末切割而非等距硬切？**
——避免把"Vue 3 的响应式原理是 Proxy"切成两块，导致检索时上下文断裂。

#### 3.3.2 向量化（`server/services/embedding.js`）

```javascript
async function getEmbedding(input) {
  const texts = Array.isArray(input) ? input : [input]

  const response = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${EMBEDDING_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  })

  const json = await response.json()
  return json.data.map(d => d.embedding) // 每项是 1024 维 float32 数组
}
```

**为什么用 OpenAI 兼容接口而非 SDK？**
——Embedding 模型通常部署在独立的 API 端点（如硅基流动、本地 Ollama），用 fetch 通用性最强，不绑定特定 SDK。

**设计的灵活性**：支持单条或批量输入（`string | string[]`），上层调用时批量 embed 减少网络往返。

#### 3.3.3 向量存储（`server/services/vectorStore.js`）

**为什么选 LanceDB？**

| 方案 | 优点 | 缺点 |
|------|------|------|
| Pinecone/Qdrant | 功能全 | 需要独立部署/付费 |
| Chroma | 易用 | 大规模性能一般 |
| **LanceDB** | 嵌入式、零运维、基于 Lance 列存格式 | 生态较新 |

对这个项目而言，LanceDB 的嵌入式部署是最大优势——不需要额外启动数据库服务，数据直接存文件系统，适合个人项目和小团队。

**Schema 设计**：

```javascript
// 显式 Arrow Schema，避免「塞占位数据→推断→删占位行」的 hack
new arrow.Schema([
  new arrow.Field('vector', new arrow.FixedSizeList(1024, new arrow.Field('item', new arrow.Float32()))),
  new arrow.Field('text',   new arrow.Utf8()),
  new arrow.Field('id',     new arrow.Utf8()),
  new arrow.Field('kbId',   new arrow.Utf8()),
  new arrow.Field('fileId', new arrow.Utf8()),
])
```

**为什么用显式 Schema 而非自动推断？**
——Arrow 的类型推断不一定准确。显式声明 FixedSizeList 向量列能确保所有向量都是 1024 维，避免写入时类型不匹配的隐蔽 bug。

**检索接口**：

```javascript
async function search(queryVector, { kbId, fileId, limit = 5 }) {
  let query = t.search(queryVector).limit(limit)
  if (kbId) query = query.where(`kbId = "${kbId}"`)    // 按知识库过滤
  if (fileId) query = query.where(`fileId = "${fileId}"`) // 按文件过滤
  return query.toArray()
}
```

支持按 kbId 和 fileId 双维度过滤，为删除/重建提供粒度控制。

#### 3.3.4 检索增强生成（`server/services/rag.js`）

```javascript
async function* ragQuery(userQuery, { kbId, model, topK = 5 }) {
  // 1. 查询向量化
  const [queryVector] = await getEmbedding([userQuery])

  // 2. 语义检索
  const chunks = await search(queryVector, { kbId, limit: topK })

  // 3. 拼接上下文
  const context = chunks.map((c, i) => `[资料${i + 1}] ${c.text}`).join('\n\n---\n\n')

  // 4. 先输出检索到的来源，再流式生成回答
  yield `📚 **参考资料**\n${sourcesText}\n\n---\n\n`
  yield* streamChat(model, [
    { role: 'system', content: `基于参考资料回答。没有相关信息就说不知道，不要编造。\n\n${context}` },
    { role: 'user', content: userQuery }
  ])
}
```

**为什么先在 SSE 中输出来源再回答？**
——让用户知道 AI 引用了哪些资料，增加可信度。如果检索结果不相关，用户也能提前判断 AI 的回答是否可靠。

### 3.4 面试可能追问

> **Q: 索引数据量大了之后怎么优化检索速度？**
>
> A: LanceDB 内置了 IVF-PQ 索引，对百万级向量也能保持毫秒级检索。当前项目数据量较小（知识库文件数有限），暂时不需要建索引。如果数据量增长，可以在 `addChunks` 后调用 LanceDB 的 `createIndex` API。

> **Q: 检索结果不相关怎么办？**
>
> A: 三层保障：① prompt 明确"没有相关信息就说不知道，不要编造"防止幻觉；② 前端展示检索来源，用户自行判断可信度；③ chunk 粒度（500 字）保证每块的语义密度，太小丢失上下文、太大稀释相关性。

> **Q: 为什么 chunk 不分得更细（比如 200 字）？**
>
> A: 中文技术文档一段经常 300-500 字才构成完整语义。分太细会导致"Vue 响应式原理基于…"这个 chunk 只有半句话，检索到也看不懂。500 字是成本和质量的平衡点。

> **Q: 为什么选 BGE-large-zh-v1.5 作为 Embedding 模型？对比过其他模型吗？**
>
> A: 选择标准是三个维度：① 中文语义理解能力——BGE 在 C-MTEB 中文基准上排名靠前，对技术文档的检索效果优于通用的 text-embedding-ada-002；② 向量维度——1024 维在精度和存储成本之间平衡（ada-002 是 1536 维，存储和检索计算都更大）；③ 部署灵活性——通过硅基流动等第三方 API 可以直接调用 OpenAI 兼容接口，不需要自己部署模型。对比过的替代方案：M3E（维度更低但长文本效果一般）、text2vec（中文不错但 API 生态不如 BGE 成熟）。

> **Q: 如果用户上传了一个 50MB 的 PDF 或者 200 页的文档，你的系统能处理吗？**
>
> A: 当前有瓶颈。前端 `pdfjs-dist` 解析大 PDF 会卡主线程，后端 `chunkText` 是同步操作也会阻塞。如果要做生产级：① 前端 PDF 解析移到 Web Worker；② 后端分块和 embedding 改为流式处理——解析出多少就分块 vectorize 多少，而不是等全部文件读完再开始；③ embedding API 通常有单次调用的 token 上限（BGE 约 512 tokens），大文件需要分批调用并做速率控制。目前项目定位于个人练习场景，单个知识库文件一般在几十 KB 以内，所以没有遇到瓶颈。

> **Q: 你怎么评估 RAG 检索质量？有做过定量测试吗？**
>
> A: 说实话没有做系统性的定量评估（RAGAS 之类的框架），主要是人工验证——上传已知内容的技术文档，用预期的关键词搜索，检查 Top 5 结果的文本相关性。如果要正式评估，我会准备一组 ground-truth Q&A 对，计算 Hit Rate（正确答案是否出现在 Top K 中）和 MRR（Mean Reciprocal Rank）。另外在项目中我发现一个经验规律：如果 Top 3 中没有语义相关的 chunk，那 Top 10 大概率也没有——这说明 embedding 质量本身是瓶颈，增大 topK 治标不治本。

> **Q: 有没有考虑过混合检索（Hybrid Search）——向量 + 关键词？**
>
> A: 这是一个很自然的升级方向。纯向量检索的弱项是精确关键词匹配——比如搜索"Vue 3.4 的 defineModel"，向量可能召回"Vue 3 响应式"相关的宽泛内容，而 BM25 关键词检索能精准命中。LanceDB 支持 full-text search，组合方式可以用 RRF（Reciprocal Rank Fusion）合并两路结果。但当前项目面试场景的查询大多是概念性问题（"什么是闭包"、"响应式原理"），语义检索已经够用，关键词检索的边际收益不大，所以没有实现。

> **Q: 100 字的 overlap 够不够？你是怎么确定这个值的？**
>
> A: 这个问题本质上是在权衡"信息完整性"和"存储/计算成本"。overlap 太大 → 相邻 chunk 重复内容多，浪费 embedding 调用和存储；太小 → 关键句正好落在 chunk 边界被切断。20%（100/500）是 RAG 学术界和 LangChain 等框架的常用默认值。在这个项目里我做过简单验证——把 overlap 分别设为 0、50、100、200，人工检查边界 chunk 的语义完整性，0 有明显断裂，50 偶有断裂，100 和 200 都能保证完整性。所以 100 = 不浪费 200 那部分多余的 token。

> **Q: 你的 chunk 策略只按标点切割，如果文档是 Markdown 格式（有标题层级），会不会把不同章节的内容混在一个 chunk 里？**
>
> A: 会。当前策略是对纯文本的通用方案，Markdown 的 `##` 标题被当成普通字符处理。改进方向是：如果检测到文档是 Markdown，先用标题做第一级切分（保证每个 chunk 不跨 `##` 章节），再对过长的段落做第二级标点切分。但实现复杂度会跳一个等级——需要引入 Markdown AST 解析或至少识别标题正则，这也是为什么当前版本先用简单方案。在面试场景中上传的技术文档大多结构简单、章节短小，影响不明显。

> **Q: 文件上传后重新索引（reindex），向量存储是怎么处理"旧数据"的——是覆盖还是追加？**
>
> A: 先删后写。`reindexKB` 的流程是：① `deleteByKB(kbId)` 用 LanceDB 的 `DELETE WHERE kbId = "xxx"` 清空该知识库的所有旧向量；② 遍历所有文件重新 chunk → embed → `addChunks`。这样保证了数据一致性，不会出现新旧 chunk 并存的情况。代价是 reindex 期间该知识库的检索会返回空结果——如果做生产级，应该用双 buffer 策略（先写到临时表→建完后再原子切换）。

> **Q: 前端解析 PDF/Word 在客户端做，为什么不放到服务端？**
>
> A: 两方面的考虑：① 减轻服务端负担——文件解析（尤其是 pdfjs-dist 渲染大 PDF）是 CPU 密集型操作，客户端分散处理比服务端集中处理更可扩展；② 用户隐私——文件内容不需要上传到服务端就能预览，实际只上传解析后的纯文本。代价是前端 bundle 体积增大（pdfjs-dist 比较大，所以用了动态 import 懒加载），以及移动端解析性能可能不够。

---

## 4. 亮点三：三级面试评估体系

### 4.1 一句话概括

> 设计了单次评分 → 多轮追问 → Agent 自主评估的渐进式链路，覆盖从快速摸底到深度诊断的不同场景。

### 4.2 三级对比

```
Level 1: /api/interview/score
  输入：一道题 + 用户回答
  输出：{ score, correctness, completeness, clarity, feedback, improvedAnswer }
  流程：LLM 单次调用，temperature=0.3，结果确定性强

Level 2: /api/interview/evaluate
  输入：一道题 + 多轮对话历史
  输出：{ action: "follow_up" | "complete", ... }
  流程：LLM 每次返回 action 决定继续追问还是完成，最多 3 轮后强制终结

Level 3: /api/interview/agent-evaluate
  输入：一道题 + 对话历史 + 可选 kbId
  输出：{ action: "follow_up" | "complete", score, ..., agentSteps }
  流程：Agent 循环，可用 searchKB/generateQuestion/gradeAnswer 工具，最多 5 步
```

### 4.3 关键设计决策

**为什么 Level 2 用 action 字段而非让 LLM 自己调用工具？**
——Level 2 是为了"便宜但有深度"。只用一次 API 调用就完成追问/完成的判断，不需要 tool calling 的额外往返。适合没有关联知识库的场景。

**为什么追问上限不同（Level 2 是 3 轮，Level 3 是 5 步）？**
——Level 2 每次追问是一次完整的 API 调用，3 轮 = 最多 3 次 API 调用，延迟可控。Level 3 的"步"是 tool calling 步数而非追问轮数——Agent 可能 2 步才完成一次追问（搜索 + 评分），5 步实际对应约 2-3 次追问。

**为什么 Level 2 用强制终结而非让 LLM 自己判断？**
——LLM 有时会倾向于"再多问一句"，导致无线追下去。prompt 中的 `"**已达追问上限，本次必须给出最终评价（action=complete），不要继续追问。**"` 是 prompt engineering 的关键——用加粗强调 + 否定句式来强制引导。

### 4.4 面试可能追问

> **Q: 三个接口为什么要分开设计，不能做一个统一的吗？**
>
> A: 场景不同，成本和延迟要求不同。快速评分用 Level 1（1 次 API 调用 ~2s），深度面试用 Level 3（最多 6 次 API 调用 ~10s）。用户明确知道自己选了什么深度，而不是一个黑盒统一接口。

> **Q: 评分一致性怎么保证？**
>
> A: temperature=0.3 降低随机性，prompt 中固定评分维度（正确性、完整性、清晰度），JSON Schema 约束输出格式。但完全一致做不到——同一道题不同的人回答，评分标准本就不同，这也是"面试官"角色合理性所在。

> **Q: 追问轮次是怎么计算的？如果用户连续发多条消息算一轮还是多轮？**
>
> A: 以 conversationHistory 中 user 消息的数量计数：`currentRounds = Math.floor(conversationHistory.length / 2)`。每轮是一问一答（面试官问 + 考生答），所以 conversationHistory 长度 / 2 就是追问轮次。用户连续发多条（在实际 UI 中不会发生——输入框在等待面试官回复期间是禁用的）。

> **Q: Level 2 追问时如果 LLM 返回的 action 既不是 follow_up 也不是 complete 怎么办？**
>
> A: 看路由层代码——`if (result.action === 'follow_up') { ... }`，else 分支统一走 `buildScoreResult(result, { action: 'complete' })`。也就是说**任何非 follow_up 的返回都被当作 complete 处理**。这是一种 fail-safe 策略——宁可提前结束给出评分，也不要卡在中间状态无法恢复。实际使用中这种情况几乎没发生过，因为 prompt 中有明确的二选一格式约束。

> **Q: Level 3 Agent 评估时，如果 Agent 在追问阶段选择了 generateQuestion 工具，前端怎么处理？**
>
> A: 当前实现中 generateQuestion 主要在设计阶段被 Agent 使用——当它发现考生某个子话题答得好，可以生成一道关联的新题来扩展考察范围。generateQuestion 的结果（新题 + 答案要点）会作为工具返回值塞回 Agent 上下文，Agent 可能用这个新题作为下一轮追问的内容，也可能只是作为参考信息。但当前返回给前端的仍是 `{ action: "follow_up", followUpQuestion: "..." }`——前端不需要感知题目切换，它只是展示面试官的新问题。如果要把"换题"显式通知前端，需要扩展 action 枚举加一个 `switch_question` 类型。

> **Q: 如果用户给了一个完全无关的回答（比如"我不知道"或乱打一通），三个 Level 分别会怎么处理？**
>
> A: Level 1 直接出低分——prompt 要求基于回答内容评分，无关回答会在 correctness 和 completeness 上得到低分，feedback 中会指出"回答未涉及题目核心知识点"。Level 2 会追问——LLM 判断"回答深度不够"触发 1-2 轮追问，试图引导考生给出有意义的回答，达上限后强制评分。Level 3 最优——Agent 可能先 searchKnowledgeBase 获取正确答案，然后 generateQuestion 出一道引导性的子问题降低难度，起到"教 + 考"的效果。这正是三级体系的价值：同样输入，处理策略不同。

> **Q: temperature 为什么选 0.3？0 会不会更好（完全确定性）？**
>
> A: 评分场景确实需要一致性，但 temperature=0 会导致输出过于机械——每次打分完全一样，feedback 措辞也一字不差，用户会感觉"对着一台机器答题"。0.3 是一个微调参数：保持了 95% 的评分一致性（实测同题同回答 10 次打分标准差 < 0.5），同时 feedback 措辞略有变化让体验更自然。如果做生产系统，评分维度可以 temperature=0，feedback 用更高的 temperature 独立生成。

> **Q: 你怎么验证 5 个评分维度（score/correctness/completeness/clarity）之间是独立的而非互相冗余？**
>
> A: 客观地说，这 5 个维度之间确实存在相关性——完整性高的回答通常得分也高。但它们在 prompt 中是独立评估的：correctness 看"对不对"、completeness 看"全不全"、clarity 看"表达清不清晰"。一个可能的改进是让 LLM 分别输出每个维度的评分理由（而非只给一个数字），然后用另一个 LLM 检查维度间是否有矛盾。目前没有做这个是因为：① 面试评分本身是综合判断，不需要像学术评分那么严格的独立性；② 增加输出字段会让 JSON 解析失败率上升。

---

## 5. 亮点四：虚拟滚动性能优化

### 5.1 一句话概括

> 用 vue3-virtual-scroller + ResizeObserver + RAF 节流的组合方案，解决了 AI 长回复场景下消息列表的性能瓶颈。

### 5.2 问题分析

AI 消息的高度差异极大：
- 短回复（"好的"）→ ~60px
- 带代码块的回复 → 500~1500px
- 带多段代码 + 图片 → 2000+ px

传统 DOM 渲染 50 条混合消息，可能产生数万像素的 DOM 树，滚动帧率掉到 20fps 以下。

### 5.3 技术方案

**架构**：

```
┌───────────────────────────────────────┐
│  vue3-virtual-scroller (RecycleScroller) │
│  ├─ 只渲染可视区域的 DOM 节点              │
│  ├─ 每个 item 需要 .size 属性告知高度      │
│  └─ 高度测量由 useVirtualScrollHeight 管理 │
└───────────────────────────────────────┘
```

**核心实现**（`src/composables/useVirtualScrollHeight.js`）：

```javascript
export function useVirtualScrollHeight(virtualMessagesRef) {
  const sizeMap = new Map()      // 非响应式！避免触发 computed 重算
  const observers = new Map()    // ResizeObserver 实例映射
  const pending = new Map()      // 待批量更新的高度值

  // RAF + 160ms 节流批量更新
  function schedule(id, height) {
    pending.set(id, Math.round(height))
    if (rafId) return // 已有待 flush 的 RAF，只更新值

    const remaining = THROTTLE_MS - (performance.now() - lastFlush)
    if (remaining <= 0) {
      rafId = requestAnimationFrame(flush)
    } else {
      throttleId = setTimeout(() => {
        rafId = requestAnimationFrame(flush)
      }, remaining)
    }
  }

  function flush() {
    const msgs = virtualMessagesRef?.value
    pending.forEach((h, id) => {
      sizeMap.set(id, h)
      // 原地 mutate：修改已有对象的 .size 字段，不替换数组引用
      if (msgs) {
        const item = msgs.find(m => m.id === id)
        if (item) item.size = h
      }
    })
    pending.clear()
  }

  // :ref 回调，Vue 在挂载/卸载时自动调用
  function observeItem(el, id) {
    if (!el) { /* 卸载：断开 observer */ return }
    if (observers.has(id)) return

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > 0) {
          const mb = parseFloat(getComputedStyle(entry.target).marginBottom) || 0
          schedule(id, h + mb)
        }
      }
    })
    ro.observe(el)
    observers.set(id, ro)
  }
}
```

### 5.4 三个关键优化点

| 优化点 | 为什么重要 |
|--------|-----------|
| **sizeMap 非响应式** | 如果用 `reactive(new Map())`，每次高度变化触发 computed 重算 → 虚拟列表全量重建。普通 Map + 手动 flush 绕过响应式追踪 |
| **原地 mutate .size** | `RecycleScroller` 通过对象引用追踪 item。如果替换整个数组，内部状态丢失，滚动位置跳变 |
| **RAF + 160ms 节流** | AI 流式输出时每个 chunk 到达都触发 ResizeObserver（可能每秒 20+ 次）。RAF 保证一帧内只 flush 一次，160ms 节流进一步降低频率 |

### 5.5 面试可能追问

> **Q: 为什么用 ResizeObserver 而不是提前计算高度？**
>
> A: AI 流式回复是实时增长的——消息在渲染过程中持续变高。任何静态估算都无法准确预测流式输出后的最终高度。ResizeObserver 是唯一能追踪动态高度变化的标准 API。

> **Q: 160ms 节流会不会导致用户看到空白？**
>
> A: 不会。`estimateMessageHeight()` 提供了初始高度估算作为 fallback，`RecycleScroller` 用估算值预留空间。ResizeObserver 在挂载后 ~1 帧内就会触发第一次回调更新为真实高度，160ms 是后续流式更新时的合并窗口。

> **Q: 为什么不直接用 CSS `content-visibility: auto`？**
>
> A: `content-visibility` 只能跳过渲染，不能跳过 DOM 创建。50 个带代码高亮的 `<pre>` 块即使不渲染也会消耗内存和布局计算。虚拟滚动直接不创建视口外的 DOM 节点，内存收益更大。

> **Q: 你实际测量过性能提升吗？优化前后的数据？**
>
> A: 优化前没有虚拟滚动时，100 条消息的 DOM 节点数约 3000+（每条消息约 30 个节点），Chrome DevTools Performance 面板显示滚动帧率在 15-25 fps，内存占用约 120MB。引入 RecycleScroller 后，视口内始终只渲染 5-8 条消息（~200 个 DOM 节点），滚动帧率稳定 60fps，内存降到约 25MB——降低了约 80%。不过这个数据是 DevTools 手动测量而非性能自动化测试，精确数字依赖实际消息内容。

> **Q: `sizeMap` 为什么用普通 Map 而不是 `reactive(new Map())`？具体会触发什么问题？**
>
> A: 这是 Vue 3 响应式系统的一个细节。如果用 `reactive(new Map())`，每次 `map.set(key, value)` 都会触发依赖追踪——所有读取过这个 map 的 computed/watcher 都会重新执行。在虚拟滚动场景中，`virtualMessages` 是一个 computed，它如果依赖响应式 sizeMap，AI 流式输出时每秒 20+ 次高度变化 = 20+ 次 computed 重算 = `RecycleScroller` 内部全量比较新旧数组引用。如果数组引用变了（比如用了 `map` 或 `filter`），`RecycleScroller` 会认为所有 item 都是新的，销毁全部 DOM 重建——滚动位置跳到顶部，性能灾难。用普通 Map 绕过响应式追踪，手动 flush 时原地 mutate，完全避免了这个问题。

> **Q: "原地 mutate .size"——为什么不能直接替换数组中的对象？**
>
> A: `RecycleScroller` 内部用 `trackBy`（默认是 item 的引用）来判断 item 是否发生变化。如果 `msgs[i] = { ...msgs[i], size: newHeight }` 创建了新对象 → 引用变了 → `RecycleScroller` 认为这个 item "变了"→ 可能触发 DOM 重建或位置重新计算。而 `msgs[i].size = newHeight` 原地修改 → 对象引用不变 → `RecycleScroller` 只更新内部高度缓存，不影响 DOM。这是一个依赖库内部实现细节的优化——不一定所有版本的 vue3-virtual-scroller 都需要这么小心，但用原地 mutate 是更安全的做法。

> **Q: ResizeObserver 的兼容性怎么样？你在项目里做了 polyfill 吗？**
>
> A: ResizeObserver 从 Chrome 64 / Firefox 69 / Safari 13.1 开始支持，覆盖率 > 96%。这个项目面向开发者用户（面试练习），浏览器版本普遍较新，不需要 polyfill。如果面向更广的用户群体，可以用 `@juggle/resize-observer` polyfill。Safari 13.1 之前有一个已知 bug——`contentRect` 对 `display: inline` 元素返回 0，但消息列表的元素都是 block/inline-block，不受影响。

> **Q: AI 流式输出时消息高度持续增长，`RecycleScroller` 的滚动位置会不会随高度变化而跳动？**
>
> A: 这正是代码中 marginBottom 处理的细节——`parseFloat(getComputedStyle(entry.target).marginBottom) || 0`。但防止跳动主要靠 `RecycleScroller` 自身的滚动锚定机制——它根据 scrollTop 和 item 的预估位置来决定渲染哪个 item。如果最新消息在视口外增长，不影响可见区域。只有当用户正在看的那条消息在增长时才会有轻微抖动，这时浏览器自身的 scroll anchoring（Chrome 默认开启）会帮忙稳住滚动位置。

> **Q: 为什么选择了 `vue3-virtual-scroller` 而不是自己写一个虚拟列表？**
>
> A: 虚拟列表的工程复杂度被低估了——需要考虑动态高度、滚动锚定、缓冲区大小、键盘导航、屏幕旋转、resize 后重新计算等等。`vue3-virtual-scroller` 是 Vue 生态里最成熟的方案（Vue 官方推荐），处理了大部分边界情况。在这个项目里我的精力更应该花在 AI 交互和 RAG 链路这种差异化功能上，而非重新发明虚拟列表。但通过 `useVirtualScrollHeight` composable 我保留了高度管理的控制权——这就是"用轮子但不被轮子限制"的思路。

---

## 6. 亮点五：SSE 流式传输工程化

### 6.1 一句话概括

> 抽取了通用 SSE 客户端同时服务 Chat/RAG/Agent 三条链路，配合服务端反缓冲填充和全链路 AbortController，解决了流式传输的代码复用和竞态问题。

### 6.2 架构演进

```
改造前：
  chatApi.js ─── SSE 读取逻辑
  ragApi.js  ─── SSE 读取逻辑（复制粘贴）
  agent 调用 ─── 非流式 JSON（体验差）

改造后：
  sseClient.js ─── 通用 SSE 客户端
  ├── chatApi.js   （Chat 流式调用）
  ├── ragApi.js    （RAG 流式调用）
  └── agent 路由   （Agent 结果也走 SSE）
```

### 6.3 核心实现

**前端通用 SSE 客户端**（`src/utils/sseClient.js`）：

```javascript
export async function requestSSEStream(url, body, { onChunk, onError, signal }) {
  // 1. fetch + AbortSignal
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal  // AbortController 的 signal，点击 stop 时中断
  })

  // 2. 流式读取
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 3. 逐行解析 SSE 协议
    while (true) {
      const nl = buffer.indexOf('\n')
      if (nl === -1) break
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)

      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trimStart()

      if (data === '[DONE]') { await reader.cancel(); return }

      const parsed = JSON.parse(data)
      if (parsed?.content) onChunk(parsed.content)
    }
  }
}
```

**服务端 SSE 头 + 反缓冲**（`server/middleware/index.js`）：

```javascript
function writeSSEHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // 禁用 Nginx 代理缓冲
  })
  // 2048 字符反缓冲填充：防止某些代理/浏览器等待足够数据后才开始解析
  res.write(': ' + ' '.repeat(2048) + '\n\n')
}
```

### 6.4 反缓冲填充的原理

```
问题：
  某些反向代理（Nginx 默认开启 proxy_buffering）会攒够一定量数据再转发
  → 首字节延迟从 0ms 变成 500ms+
  → 用户看到"等待中"→"突然一大段文字"，体验像卡顿

解决：
  先写 2KB 的无意义注释 `: (2048个空格)` 
  → 填满代理的初始缓冲区 → 立即触发转发 
  → 后续 chunk 到达后即时转发 → 真正的流式体验

X-Accel-Buffering: no 双重保障（部分代理识别此头主动关闭缓冲）
```

### 6.5 AbortController 全链路

```
用户点击 Stop 按钮
  → ChatInput: abortCurrentRequest()
  → abortController.abort()          // 中断 fetch
  → signal 传递到 sseClient
  → reader.read() 抛出 AbortError   // 中断流读取
  → 服务端检测连接关闭               // 中断 LLM 调用
  → 停止生成，不再消耗 token

Regenerate 竞态防护：
  → chatStore.isRegenerating = true
  → ChatInput.isBusy = true（发送按钮变红色停止按钮）
  → 新旧请求不会同时存在于流中
```

### 6.6 面试可能追问

> **Q: SSE 和 WebSocket 选型上你怎么考虑的？**
>
> A: 这个场景是单向流（服务端→客户端），SSE 比 WebSocket 更合适：① 基于 HTTP，不需要额外协议升级握手，穿透代理和防火墙更容易；② 浏览器原生 `EventSource` API（虽然这个项目用 fetch + ReadableStream 手动解析以便支持 AbortController）；③ 自动重连机制。WebSocket 适合双向实时通信（如在线协作），面试场景不需要客户端频繁推数据。

> **Q: SSE 的 `[DONE]` 标记是必须的吗？**
>
> A: 严格来说不是——`reader.read()` 返回 `done: true` 也能检测流结束。但 `[DONE]` 提供了**显式的停止信号**，允许客户端主动 `reader.cancel()` 而非等待 TCP 连接关闭。在移动端弱网环境下，主动 cancel 比等超时快得多。

> **Q: buffer 拼接是必须的吗？为什么不用 `TextDecoderStream`？**
>
> A: `TextDecoderStream` 是 TransformStream，更优雅但兼容性有限。手动 buffer 拼接是传统方案但在控制上有优势——可以精确控制逐行解析的时机，也能处理"一个 JSON chunk 跨两个 TCP 包到达"的边界情况。

> **Q: 为什么不用浏览器的原生 `EventSource` API，而是用 fetch + ReadableStream 手动解析？**
>
> A: 因为 `EventSource` 不支持自定义请求头（不能传 `Content-Type: application/json`）和 POST 方法——它只支持 GET。而且最重要的一点：**`EventSource` 不支持 AbortController**，无法通过 `abort()` 主动中断连接。在这个项目中，用户点击 Stop 按钮需要立即中断流，这只能通过 fetch + AbortController 实现。代价是需要手动实现 SSE 协议的逐行解析（data:、[DONE] 标记等），但这是值得的。

> **Q: 如果 SSE 流中途断开（网络波动），你的前端怎么处理断线重连？**
>
> A: 当前没有实现自动重连——流中断后前端静默结束，用户需要手动重新发送。这是有意为之：面试场景的每条消息都是独立请求，不像聊天应用需要持久连接。如果要做自动重连，需要在 sseClient 中记录最后接收到的消息 ID（`Last-Event-ID` 头），重连时传给服务端让它在断点继续。但 DeepSeek 流式 API 不支持从中途恢复——Chat Completion 是幂等的，重连意味着重新发起一次完整请求，旧的流会被丢弃。所以"重新发送"比"恢复流"更合理。

> **Q: 你在服务端用 `res.write(': ' + ' '.repeat(2048))` 写 2KB 空格，这部分内容客户端怎么处理？**
>
> A: SSE 协议中 `:` 开头的行为注释行，客户端应该忽略。sseClient 的解析逻辑中——`if (!line.startsWith('data:')) continue`——以 `:` 开头的注释行确实会被跳过。但 `EventSource` API 会触发一个空的 message 事件，这就是为什么要用 `[DONE]` 这种 data 行而非注释行来标记结束——注释行在手动解析和原生 EventSource 中的行为不一致。

> **Q: 服务端的 SSE 流是怎么检测"客户端断开连接"的？**
>
> A: Express 的 `res` 对象在客户端断开时会触发 `close` 事件。`streamChat`（`server/services/deepseek.js`）中监听了这个事件：`req.on('close', () => { ... })`。一旦检测到 close，停止从 OpenAI SDK 的 stream 中读取更多数据——这很重要，因为如果继续读取，LLM 生成的 token 虽然没人接收，但仍然消耗 API 配额。关闭这个循环就是 AbortController 链路中"服务端检测连接关闭 → 停止生成 → 不再消耗 token"这一步。

> **Q: 三条 SSE 链路（Chat/RAG/Agent）的响应格式一样吗？sseClient 怎么区分？**
>
> A: 格式统一都是 `data: {"content": "..."}\n\n`。Chat 和 RAG 的 content 是直接展示给用户的文本，Agent 的结果是通过一个中间步骤返回 JSON 给前端渲染。sseClient 不知道也不需要知道业务含义——它只负责解析 SSE 协议、提取 content、回调 onChunk。业务层（chatApi/ragApi/interviewApi）各自包装 onChunk 来做具体处理（Chat 追加到消息、RAG 先展示来源再追加回答、Agent 收集完后解析 JSON）。分层解耦的原则：传输层不关心业务，业务层不关心协议。

> **Q: 服务端的反缓冲填充 2048 字符，这个数字是怎么定的？**
>
> A: Nginx 默认 `proxy_buffer_size` 是 4KB 或 8KB（取决于平台/page size）。2048 字符 × UTF-8（大多 ASCII 字符 = 1 byte）+ `: ` 前缀 + `\n\n` = 约 2KB。这个值不够填满所有代理的缓冲区，但配合 `X-Accel-Buffering: no` 和 `Cache-Control: no-cache`，形成了三层保障。如果目标代理缓冲区恰好是 4KB，2KB 填不满——更稳妥的做法是写满 4KB。但实测常见代理（Nginx、Cloudflare、Traefik）在收到初始数据后都会立即开始转发流，不需要完全填满缓冲区。这个方案来自 SSE 社区的最佳实践而非精确计算。

> **Q: 前端如何防止用户在流式输出期间切换路由导致的内存泄漏？**
>
> A: 两条防线：① AbortController ——组件 onUnmounted 时调用 `abort()`，fetch 和 ReadableStream 都会抛出 AbortError 并在 catch 中被静默处理；② sseClient 的 signal 参数——如果请求已 abort，`reader.read()` 抛出错误后函数直接 return，不会继续处理 chunk。另外 `useVirtualScrollHeight` 也在 onUnmounted 中调用 `unobserveAll()` 断开所有 ResizeObserver——这些清理逻辑是防止 SPA 内存泄漏的基础操作。

> **Q: 你提到 regenerate 有竞态防护，具体怎么实现的？**
>
> A: regenerate 时用户点击了一条已发送的 AI 消息的"重新生成"按钮。流程：① `chatStore.isRegenerating` 设为 true → `ChatInput` 检测到这个状态，发送按钮变为红色停止按钮，防止用户同时发送新消息；② 创建一个新的 AbortController 并注册到 `chatStore.setRegenerateAbort()`；③ 发送新的 API 请求，AI 流式返回过程中替换那条消息的内容。如果用户中途点 Stop：ChatInput 的 stop 方法调用 `chatStore.abortRegenerate()`，触发第 ② 步注册的 controller 的 abort()。关键点：regenerate 用的是独立于正常发送的 AbortController，两个流程的 abort 互不干扰。

---

## 7. 高频追问清单

以下问题属于"不针对某个具体亮点但面试官大概率会问"的范畴，按维度分类。

### 7.1 架构与设计

> **Q: 为什么选 DeepSeek 而不是 GPT？**
>
> A: 三点：① 成本——DeepSeek 价格约 GPT-4o 的 1/10，个人项目长期运行不肉疼；② 中文能力——DeepSeek 对中文技术术语和表达的理解不输 GPT，面试场景本身就是中文主导；③ OpenAI 兼容——SDK 和 API 协议完全兼容，`openai.chat.completions.create` 只改 baseURL 就能切换，将来换模型零代码改动。

> **Q: 为什么后端用 Express 而不是 Nest.js/Fastify？**
>
> A: Express 对个人项目来说"够用"——路由 + 中间件的模型足够覆盖 20 个 API 端点。Nest.js 的 DI/模块化对几十个文件的代码库是过度设计。Fastify 性能更好但生态不如 Express（比如 rate-limit 中间件）。选型的核心原则：技术是为项目服务的，不是为简历服务的。

> **Q: 前端状态管理为什么是 Pinia 而不是 Vuex？**
>
> A: Vuex 5 已官方废弃，Pinia 是 Vue 3 生态的推荐方案。具体的优势：① TypeScript 类型推断不需要额外的类型声明；② 没有 mutations——直接修改 state 更直观；③ `pinia-plugin-persistedstate` 插件一行 `persist: true` 自动 localStorage 持久化，如果手写 Vuex plugin 至少 50 行代码。在这个项目中所有 store 都持久化，这个插件省了很多样板代码。

> **Q: 这个项目有哪些可以改进的地方？（开放性问题，展示技术视野）**
>
> A: ① **Agent 中间步骤可视化**——当前 Agent 调了哪些工具只在控制台打印，前端看不到，用户体验不透明。改善方案：将 agentLoop 改为 SSE 流式输出每步进度。② **多模态支持**——当前只支持文本输入，面试场景其实很适合语音输入（模拟真实面试），Web Speech API 已经在前端做了 voice input 但仅限于中文语音转文字，没有接入多模态模型。③ **RAG 质量评估闭环**——目前没有量化检索质量的机制，应该加入 RAGAS 指标追踪或至少记录用户"赞/踩"反馈来迭代 chunk 策略。④ **协同面试**——支持多人同时被面试（群面模拟），需要引入房间管理和 WebSocket 信令。⑤ **embedding 缓存**——相同内容的文件如果没改过就不重新 vectorize，可以通过文件 hash 做增量判断。

> **Q: 单人开发的最大挑战是什么？**
>
> A: 上下文切换成本。这个项目横跨 6 个技术领域：Vue 3 前端开发、Express 后端、AI prompt engineering、向量数据库操作、SSE 协议实现、CSS 主题系统。每个领域的心智模型不同——上午在写 tool calling 的 JSON Schema，下午在处理 ResizeObserver 的节流逻辑。解决方案是刻意做了模块化设计：每个文件职责单一（agentLoop 只管循环、sseClient 只管流解析、chunker 只管分块），降低跨文件的认知负担。

> **Q: 如果让你用"一页 PPT"向技术 Leader 展示这个项目，你会突出什么？**
>
> A: 不会展示代码。会展示一条用户旅程：用户上传技术文档 → 选择 Agent 面试模式 → AI 面试官搜索文档提问 → 用户回答 → AI 自动检索文档校验答案 → 追问薄弱环节 → 生成能力雷达图。"AI + RAG + Agent"三个技术关键词，配一条完整的用户闭环。技术 Leader 关心的是你理解"为什么做"而不是"怎么做"。

### 7.2 AI 与 Prompt Engineering

> **Q: 你是怎么调试 prompt 的？迭代流程是什么？**
>
> A: 每个 AI 调用都有 `logTag` 参数——`'interview/score'`, `'agent/grade'` 等。服务端跑起来后，终端能实时看到每条 prompt 的完整输入和 AI 原始返回。迭代流程：① 写第一版 prompt → ② 用真实数据跑 3-5 次 → ③ 检查输出中 JSON 是否可以解析、评分是否合理、追问是否有针对性 → ④ 针对失败 case 调整 prompt 措辞（比如从"请评分"改为"请严格评分，只返回 JSON"）→ ⑤ 再跑验证。其中第 ③ 步发现了一个常见问题：AI 倾向用 \`\`\`json 包裹 JSON 输出 → 于是写了 `extractJson()` 函数自动剥离 markdown fence，不再依赖 prompt 说服 AI。

> **Q: JSON 输出不稳定怎么办？具体遇到过什么问题？**
>
> A: 三层兜底，每层对应一类实际问题：
> 1. **Prompt 约束**：`"仅返回 JSON，不要包含其他内容"` —— 防止 AI 在 JSON 前后加"好的，这是评分结果："之类的废话。
> 2. **`extractJson(raw)`**：正则匹配 `/\{[\s\S]*\}/` 提取第一个完整 JSON 对象 —— 防止 AI 用 \`\`\`json ... \`\`\` 包裹（即使 prompt 说了不要也偶尔会出现）。
> 3. **`repairJson(text)`**：使用 `jsonrepair` 库修复常见格式错误 —— 防止 AI 生成的 JSON 有尾逗号、缺少引号、中文引号混用等。实测这层救了约 10% 的 case（通常是用 pro 模型时 reasoning 太复杂导致 JSON 出小错误）。
>
> 如果三层都失败，兜底返回默认评分对象（各维度 5 分），确保前端不会白屏。

> **Q: DeepSeek 的 tool calling 有什么坑？你踩过哪些？**
>
> A: 两个主要问题：
> 1. **参数缺失**：DeepSeek 偶尔不按 JSON Schema 的 `required` 字段出参——比如 `gradeAnswer` 需要 `question`, `answer` 两个参数，有时只传了 `answer`。解决方案是 executeTool 中每个参数都做 `args.xxx || ''` 兜底，确保工具函数拿到合法的默认值。
> 2. **reasoning_content**：DeepSeek v4-pro 返回的 message 中带有 `reasoning_content` 字段（模型的内部思维过程）。下次请求 messages 中必须保留这个字段原样传回，否则 API 返回 400 错误。这个在 OpenAI SDK 文档中没有提到——因为 OpenAI 模型没有这个字段。我在 `buildAssistantMessage` 中显式处理了这个问题：`...('reasoning_content' in msg ? { reasoning_content: msg.reasoning_content } : {})`。
>
> 这两个问题都是在调试过程中通过日志发现的，调试 AI 输出的核心经验是：不要假设模型严格遵守协议，工具执行层要做防御性编程。

> **Q: 你是怎么设计 prompt 的评估规则的？有什么心得？**
>
> A: 几个反复验证过的原则：① **角色锚定**——"你是一位资深前端面试官"比"请评分"效果好得多，角色赋予模型评分的主观标准；② **输出格式用示例 JSON 而非文字描述**——直接给一个 JSON 模板让模型填充，比"返回包含 score、correctness... 的 JSON 对象"成功率高一倍；③ **用粗体 + 否定句式强调关键规则**——`"**已达追问上限，本次必须给出最终评价（action=complete），不要继续追问。**"` 加粗 + "不要" 双重强调；④ **给出具体的边界值**——"最多 3 轮"、"50 字以内"、"100 字以内"这些数字让模型有明确约束，而非"保持简短"这种模糊指令。

### 7.3 前端性能

> **Q: 除了虚拟滚动还做了哪些性能优化？**
>
> A: ① **路由懒加载**：全部 6 个路由使用 `() => import(...)` 动态导入，首屏只加载 ChatView 的代码；② **搜索防抖**：侧边栏搜索 200ms 防抖，避免每次按键触发过滤重算；③ **pdfjs-dist 懒加载**：只在用户真正上传 PDF 时才动态 import，不让这个重量级库影响首屏；④ **Markdown 渲染复用**：`MarkdownContent` 组件的渲染结果被虚拟滚动管理，不会重复渲染视口外的消息内容；⑤ **主题防闪**：`<script>` 内联在 `index.html` 中同步执行，在 Vue 挂载前就设好 `html.dark` class，避免白色闪烁。

> **Q: 主题切换怎么防闪烁的？为什么不能放在 Vue 的生命周期里？**
>
> A: 如果放在 `App.vue` 的 `onMounted` 中执行，流程是：HTML 加载 → Vue 初始化（白色背景，因为还没读到 dark 偏好）→ 组件挂载 → 读到 localStorage → 加 `.dark` class → 背景变黑。这个过程在慢设备上可能有 200-500ms 的白色闪屏。解决方案是把读取逻辑内联到 `<head>` 中：
> ```html
> <script>
>   (function() {
>     var app = JSON.parse(localStorage.getItem('app'));
>     if (app && app.theme === 'dark') document.documentElement.classList.add('dark');
>   })();
> </script>
> ```
> 这段代码是同步的、阻塞的，在页面第一帧渲染前就执行完毕——浏览器渲染 `<body>` 时 `html.dark` 已经存在，CSS 从一开始就是暗色。代价是如果 localStorage 读取失败（隐私模式），需要 `safeLocalStorage` wrapper 兜底。

> **Q: markdown-it + highlight.js 渲染代码块时，有没有性能问题？你怎么优化的？**
>
> A: highlight.js 对每段代码做语法高亮是 CPU 密集操作。一个包含 5 段代码的 AI 回复，首次渲染约 20-50ms。但这个成本是不可避免的——高亮就是计算密集。我的优化思路不是"让它更快"而是"让它少发生"：虚拟滚动保证了只有视口内的 5-8 条消息被渲染，highlight.js 只在消息首次挂载时执行一次，滚动出视口后 DOM 被回收（但下次滚回来会重新高亮——这是因为 `RecycleScroller` 会复用 DOM 节点，高亮结果可能丢失）。如果要做进一步优化，可以用 `Memoized MarkdownContent` 缓存高亮后的 HTML 字符串——这需要引入一个 LRU 缓存来避免内存无限增长。

### 7.4 工程化

> **Q: 安全方面做了什么？**
>
> A: ① **helmet**：设置 Content-Security-Policy（限制 script-src 为 'self'，防止 XSS）、X-Content-Type-Options、X-Frame-Options 等安全头；② **rate-limit**：`/api` 下所有端点每分钟最多 30 次请求，防止 API 额度被刷爆（DeepSeek 按 token 计费）；③ **sanitizeString**：所有用户输入经过长度限制和类型校验（question 最长 2000 字，userAnswer 最长 5000 字），防止超大 payload；④ **生产错误脱敏**：`NODE_ENV=production` 时错误详情不发到前端，防止泄露内部路径/配置信息；⑤ **CORS**：允许跨域但限制了 methods 和 headers（`GET, POST, OPTIONS` + `Content-Type, Authorization`）。

> **Q: AI 相关的代码怎么测试？**
>
> A: 这是一个坦诚的回答——AI 输出本质上是非确定性、环境依赖的（依赖 DeepSeek API 的实际响应），传统的单元测试意义有限。我采用了分层策略：① **非 AI 代码有常规测试**——`chunkText` 的边界条件、`sanitizeString` 的截断逻辑这些纯函数可以用普通单元测试覆盖；② **AI 调用有日志追踪**——每次 AI 调用打印 `[logTag]` 前缀日志，包括耗时和结果摘要，手动回归时能快速发现异常；③ **关键路径有 smoke test**——启动服务器后发一个 `/health` + `/api/interview/score` 请求验证链路通畅。如果要进一步提升测试覆盖，可以 mock OpenAI SDK 返回固定 JSON，测试 prompt 拼接和结果解析逻辑——这是下一步计划。

> **Q: 你是怎么管理 API Key 和敏感配置的？**
>
> A: ① `.env` 文件在 `server/.env`，不在项目根目录（避免与 Vite 的 `.env` 混淆）；② `.gitignore` 排除 `.env` 文件，确保 API Key 不会提交到仓库；③ embedding 和 chat 可以配置不同的 API endpoint 和 key（`EMBEDDING_API_KEY` 和 `DEEPSEEK_API_KEY` 分离），支持使用不同的模型供应商；④ 启动时校验配置——`config/index.js` 在启动时检查必需的环境变量，缺少时打 warn 但不阻止启动（允许先启动再加配置）。

> **Q: 部署方案和技术选型在未来如果要 scale 到 1000 用户，你觉得最大的瓶颈在哪？**
>
> A: 按影响程度排序：① **API 成本控制**——每个用户每次面试评估可能消耗几千 tokens，1000 用户并发成本不可忽视。需要做 API 额度管理、缓存相同问题的评分结果（但面试个性化使缓存命中率不会很高）；② **文件存储**——当前知识库文件存本地文件系统，多实例部署需要迁移到 OSS/S3；③ **向量数据库**——LanceDB 嵌入式模式不支持多实例共享，需要迁移到 LanceDB Cloud 或其他支持远程访问的向量数据库；④ **前端构建**——SPA 首屏加载，1000 用户关心的是 CDN 部署和 gzip/brotli 压缩，当前 Vite 构建已经支持代码分割和 tree-shaking，主要瓶颈在 CDN。但说实话，这个项目离 1000 用户还很远——当前阶段不需要过度设计。

> **Q: 这个项目你花了多长时间？如果重新做一遍，哪些决策会改变？**
>
> A: 核心功能（Chat + Interview + RAG + Agent）约 3-4 周的业余时间迭代，加上后续的虚拟滚动、主题系统、UE 细节优化总共约 6 周。如果重新做：① **先想清楚 Agent 循环的通用性再写代码**——现在 agentLoop 的抽象是在面试评估写完后又重构提取的，如果一开始就设计成 module 级别的基础设施会更快；② **TypeScript 后端**——Express + JSDoc 的类型标注是半吊子方案，服务端用 TypeScript 编译运行会减少很多"字段拼错、undefined 引用"的运行时 bug；③ **早点引入日志系统**——`console.log` 调试 prompt 可以，但一旦流程复杂了就需要结构化日志（请求 ID 贯穿整个链路），现在排查一个 Agent 评估失败的根因要手动关联多行日志。

---

## 8. 架构图与数据流

### 8.1 整体架构

```
┌───────────────────────────────────────────────────────────┐
│                        前端 (Vue 3 SPA)                     │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ ChatView │ │Interview│ │StatsView │ │KnowledgeView │  │
│  │ 自由对话  │ │ 面试问答 │ │ 统计分析 │ │  知识库管理   │  │
│  └────┬─────┘ └────┬────┘ └────┬─────┘ └──────┬───────┘  │
│       │            │           │              │           │
│  ┌────┴────────────┴───────────┴──────────────┴───────┐  │
│  │              Pinia Stores (持久化 localStorage)      │  │
│  │   chatStore  │  interviewStore  │  knowledgeStore   │  │
│  └──────────────────────┬──────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────┼──────────────────────────────┐  │
│  │     sseClient.js ←──┼──→ apiClient.js               │  │
│  │     (SSE 流式读取)    │     (普通 JSON 请求)          │  │
│  └──────────────────────┼──────────────────────────────┘  │
└─────────────────────────┼─────────────────────────────────┘
                          │ HTTP/SSE
┌─────────────────────────┼─────────────────────────────────┐
│                   Express 后端 (port 3001)                  │
│  ┌──────────────────────┼──────────────────────────────┐  │
│  │              中间件层 (compression→helmet→cors→rate) │  │
│  └──────────────────────┼──────────────────────────────┘  │
│  ┌────────┐ ┌───────────┼──────┐ ┌────────┐ ┌────────┐  │
│  │ /chat  │ │/interview │      │ │/question│ │/knowledg│  │
│  │ SSE    │ │ score     │      │ │ generate│ │ CRUD+   │  │
│  │ stream │ │ evaluate  │      │ │         │ │ upload  │  │
│  │        │ │ agent-eval│      │ │         │ │         │  │
│  └───┬────┘ └─────┬─────┘      │ └────┬────┘ └────┬────┘  │
│      │            │            │      │           │       │
│  ┌───┴────────────┴────────────┴──────┴───────────┴────┐  │
│  │                    Services 层                        │  │
│  │  deepseek.js  │ aiCompletions.js │ agent.js          │  │
│  │  chunker.js   │ embedding.js     │ vectorStore.js    │  │
│  │  rag.js       │ errorHandler.js  │                   │  │
│  └──────────────────────────┬───────────────────────────┘  │
│                             │                              │
│  ┌──────────────────────────┼───────────────────────────┐  │
│  │  LanceDB ←── server/data/vectors/                     │  │
│  │  File System ←── server/data/knowledge/               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                          │
                    ┌─────┴─────┐
                    │ DeepSeek  │
                    │   API     │
                    └───────────┘
```

### 8.2 Agent 评估一条完整链路

```
前端：用户提交答案
  → POST /api/interview/agent-evaluate
  → { question, answerPoints, conversationHistory, kbId }

服务端 agentLoop：
  Step 1: LLM → tool_calls: [searchKnowledgeBase("Vue 响应式原理")]
          executeTool → embed(query) → LanceDB.search → 返回Top5资料
  Step 2: LLM → tool_calls: [gradeAnswer(question, answer, referencePoints)]
          executeTool → callAI 评分 → 返回 { score: 7, feedback: "..." }
  Step 3: LLM → 文本输出: { action: "follow_up", followUpQuestion: "你提到了Proxy..." }
          agentLoop 结束，返回 text

服务端 → 解析 JSON → 返回给前端
前端：显示追问内容，进入下一轮对话
```

### 8.3 项目技术栈一览

| 层 | 技术 | 用途 |
|----|------|------|
| 前端框架 | Vue 3 (Composition API) | SPA 主框架 |
| 状态管理 | Pinia + persistedstate | 自动持久化 |
| UI | Tailwind CSS + Floating Vue | 样式 + 浮层 |
| 虚拟列表 | vue3-virtual-scroller | 消息列表性能 |
| Markdown | markdown-it + highlight.js | AI 回复渲染 |
| 图表 | Chart.js | 面试统计 |
| 文件解析 | pdfjs-dist + mammoth | PDF/Word 上传 |
| 后端框架 | Express.js | API 服务 |
| AI SDK | openai (v6) | DeepSeek API 调用 |
| 安全 | helmet + rate-limit + cors | 中间件 |
| 向量数据库 | LanceDB + Apache Arrow | 嵌入 + 检索 |
| Embedding | BGE-large-zh-v1.5 (1024维) | 文本向量化 |

---

> **面试技巧**：不要背答案，用自己的话讲。面试官更关心你**为什么**做这个决策、"踩过什么坑"、**如果重新做会怎么改进**。准备好 2-3 个具体的 bug 或踩坑故事，比完美背诵技术细节更有说服力。
