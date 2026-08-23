/**
 * Cross-Encoder 重排序 —— 用专用 Reranker 模型对向量检索结果做精确重排
 *
 * 向量检索（bi-encoder: embedding 相似度）只能抓「语义相近」，
 * cross-encoder 把 (query, document) 拼在一起输入模型，直接输出相关度分数，
 * 精度远高于向量余弦相似度，是 RAG 管线中性价比最高的质量提升手段。
 *
 * 支持的 API（OpenAI 兼容 /rerank 格式）：
 *   - SiliconFlow:  BAAI/bge-reranker-v2-m3
 *   - Jina AI:      jina-reranker-v2-base-multilingual
 *   - 其他兼容 /rerank 接口的服务商
 */

import type { SearchResult } from '../types'

// 默认复用 embedding 配置，也可单独配置更精细的模型
const RERANK_BASE_URL = process.env.RERANK_BASE_URL || process.env.EMBEDDING_BASE_URL
const RERANK_MODEL = process.env.RERANK_MODEL || 'BAAI/bge-reranker-v2-m3'
const RERANK_API_KEY = process.env.RERANK_API_KEY || process.env.EMBEDDING_API_KEY

interface RerankResult {
  index: number
  relevance_score: number
}

/**
 * 用 Cross-Encoder Reranker 对候选块重排序，返回 top-N
 *
 * @param query     用户问题
 * @param chunks    向量检索召回的候选块（建议 20~50 条）
 * @param topN      最终保留数量（默认 5）
 * @returns         按相关度降序排列的 top-N 块
 */
export async function rerankChunks(
  query: string,
  chunks: SearchResult[],
  topN = 5,
  _model?: string, // 保留参数兼容，实际由环境变量控制
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (chunks.length <= topN) return chunks

  if (!RERANK_API_KEY || !RERANK_BASE_URL) {
    console.warn('[reranker] 未配置 Rerank API，跳过重排序')
    return chunks.slice(0, topN)
  }

  const documents = chunks.map((c) => c.text)

  try {
    const response = await fetch(`${RERANK_BASE_URL}/rerank`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RERANK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents,
        top_n: topN,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Rerank API 返回 ${response.status}：${body}`)
    }

    const json = await response.json()
    const results: RerankResult[] = json?.results

    if (!Array.isArray(results) || results.length === 0) {
      console.warn('[reranker] API 返回空结果，降级为原始排序')
      return chunks.slice(0, topN)
    }

    const sorted = results
      .filter((r) => r.index >= 0 && r.index < chunks.length)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, topN)

    console.log(
      `[reranker] ${RERANK_MODEL} 重排完成: ${chunks.length} 条候选 → ${sorted.length} 条精选 ` +
        `(top3 scores: ${sorted
          .slice(0, 3)
          .map((r) => r.relevance_score.toFixed(4))
          .join(', ')})`,
    )

    return sorted.map((r) => chunks[r.index])
  } catch (err: any) {
    console.warn(`[reranker] 调用失败，降级为原始排序: ${err.message}`)
    return chunks.slice(0, topN)
  }
}
