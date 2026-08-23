import { requestSSEStream } from './sseClient'

export function requestRagStream({
  query,
  kbId,
  model,
  onChunk,
  onError,
  signal,
}: {
  query: string
  kbId?: string
  model?: string
  onChunk: (chunk: string) => void
  onError?: (msg: string) => void
  signal?: AbortSignal
}): Promise<void> {
  return requestSSEStream('/api/rag/search', { query, kbId, model }, { onChunk, onError, signal })
}
