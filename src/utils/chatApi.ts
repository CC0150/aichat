import { requestSSEStream } from './sseClient'

export function requestChatStream(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  {
    onChunk,
    onError,
    signal,
  }: {
    onChunk: (chunk: string) => void
    onError?: (msg: string) => void
    signal?: AbortSignal
  },
): Promise<void> {
  return requestSSEStream('/api/chat', { model, messages }, { onChunk, onError, signal })
}

export { isAbortError } from './index'
