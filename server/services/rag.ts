/**
 * RAG 查询 —— 串联 embedding → 向量检索 → (可选重排序) → LLM 流式生成
 *
 * 入库阶段（文件上传时执行一次）：
 *   文件文本 → chunkText() → getEmbedding() → addChunks()
 *
 * 查询阶段（用户每次提问时执行）：
 *   用户问题 → getEmbedding() → search() → rerankChunks() → 拼接 system prompt → streamChat()
 */

import { getEmbedding } from './embedding'
import { search } from './vectorStore'
import { streamChat } from './deepseek'
import { rerankChunks } from './reranker'
import type { RagQueryOptions } from '../types'

/** 安全清理 HTML/XML 标签，防止源码碎片污染参考资料显示 */
function stripHtml(text: string): string {
  return text
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/\s*>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 重排序时粗排召回的数量（从大量候选中精选） */
const RERANK_CANDIDATE_COUNT = 20

/**
 * RAG 流式查询
 */
export async function* ragQuery(
  userQuery: string,
  { kbId, model = 'deepseek-v4-pro', topK = 5, rerank = true }: RagQueryOptions = {},
  signal?: AbortSignal,
): AsyncGenerator<string> {
  // Step 1: 把用户问题转成向量
  const [queryVector] = await getEmbedding([userQuery], signal)

  // Step 2: 向量检索 —— 重排模式下多召回一些候选
  const searchLimit = rerank ? RERANK_CANDIDATE_COUNT : topK
  let chunks = await search(queryVector, { kbId, limit: searchLimit })

  // Step 3: 可选重排序 —— 用 LLM 对候选块做相关度打分，精选 topK
  if (rerank && chunks.length > topK) {
    const reranked = await rerankChunks(userQuery, chunks, topK, model, signal)
    chunks = reranked as any // ScoredChunk 兼容 SearchResult
  }

  // Step 4: 拼接上下文
  const context = chunks.map((c, i) => `[资料${i + 1}] ${stripHtml(c.text)}`).join('\n\n---\n\n')

  const systemPrompt = `你是一个专业的面试辅导助手。请基于以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请如实告知用户，不要编造。

===== 参考资料 =====
${context}
===================

回答要求：
- 基于参考资料，如果没有相关信息就如实说
- 回答准确、简洁
- 如果能引用具体的资料段落，请在回答中注明`

  // Step 5: 流式生成回答（参考资料已注入 system prompt，不在回复中重复展示）
  yield* streamChat(
    model,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery },
    ],
    signal,
  )
}
