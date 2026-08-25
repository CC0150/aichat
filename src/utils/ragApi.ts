import { requestSSEStream } from './sseClient'
import { useAppStore } from '@/stores/app'

/**
 * RAG 流式检索问答
 * model/baseUrl/apiKey 由 app store 统一注入（支持用户自带 Key）
 */
export function requestRagStream({
  query,
  kbId,
  onChunk,
  onError,
  signal,
}: {
  query: string
  kbId?: string
  onChunk: (chunk: string) => void
  onError?: (msg: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const app = useAppStore()
  return requestSSEStream('/api/rag/search', app.aiRequestParams({ query, kbId }), {
    onChunk,
    onError,
    signal,
  })
}
