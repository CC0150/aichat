export { modelOptions, getModelById } from './modelConfig'
export { requestChatStream } from './chatApi'
export { autoResize } from './textarea'

/**
 * 判断错误是否为 AbortError（网络请求被取消）
 */
export function isAbortError(err: unknown): boolean {
  const e = err as any
  return (
    e?.name === 'AbortError' ||
    e?.code === 'ABORT_ERR' ||
    /aborted|abort/i.test(String(e?.message || ''))
  )
}
