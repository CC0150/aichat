import { requestSSEStream } from './sseClient'

const RAG_API = '/api/rag/search'

/**
 * RAG 知识库搜索（SSE 流式）
 * @param {{ query: string; kbId?: string; model?: string; onChunk: Function; onError?: Function; signal?: AbortSignal }} opts
 */
export function requestRagStream({ query, kbId, model, onChunk, onError, signal }) {
  return requestSSEStream(RAG_API, { query, kbId, model }, { onChunk, onError, signal })
}
