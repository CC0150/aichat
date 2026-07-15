/**
 * RAG 查询 —— 串联 embedding → 向量检索 → LLM 流式生成
 *
 * 入库阶段（文件上传时执行一次）：
 *   文件文本 → chunkText() → getEmbedding() → addChunks()
 *
 * 查询阶段（用户每次提问时执行）：
 *   用户问题 → getEmbedding() → search() → 拼接 system prompt → streamChat()
 */

const { getEmbedding } = require('./embedding')
const { search } = require('./vectorStore')
const { streamChat } = require('./deepseek')

/**
 * RAG 流式查询
 * @param {string} userQuery - 用户问题
 * @param {{ kbId?: string, model?: string, topK?: number }} opts
 * @returns {AsyncGenerator<string>}
 */
async function* ragQuery(userQuery, { kbId, model = 'deepseek-v4-pro', topK = 5 } = {}) {
  // Step 1: 把用户问题转成向量
  const [queryVector] = await getEmbedding([userQuery])

  // Step 2: 在知识库里检索最相似的 K 个块
  const chunks = await search(queryVector, { kbId, limit: topK })

  // Step 3: 拼接上下文 + 引用来源
  const context = chunks
    .map((c, i) => `[资料${i + 1}] ${c.text}`)
    .join('\n\n---\n\n')

  const sourcesText = chunks
    .map((c, i) => `[资料${i + 1}] ${c.text.slice(0, 120)}${c.text.length > 120 ? '...' : ''}`)
    .join('\n')

  const systemPrompt = `你是一个专业的面试辅导助手。请基于以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请如实告知用户，不要编造。

===== 参考资料 =====
${context}
===================

回答要求：
- 基于参考资料，如果没有相关信息就如实说
- 回答准确、简洁
- 如果能引用具体的资料段落，请在回答中注明`

  // Step 4: 流式生成，先输出来源再输出回答
  yield `📚 **参考资料**\n${sourcesText}\n\n---\n\n`
  yield* streamChat(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userQuery },
  ])
}

module.exports = { ragQuery }
