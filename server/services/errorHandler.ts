import type { Response } from 'express'
import type { ErrorHandlerOptions } from '../types'

/**
 * 统一的 AI 调用错误处理
 */
export function handleAIError(
  res: Response,
  err: unknown,
  logTag: string,
  { fallbackMessage, extras = {} }: ErrorHandlerOptions = {},
): void {
  const msg = fallbackMessage || '服务异常'
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[${logTag}] 失败:`, message)
  if (err instanceof SyntaxError) {
    console.error(`[${logTag}] JSON 解析失败`)
  }
  res.status(502).json({
    error: err instanceof Error ? err.message : msg,
    retryable: true,
    ...extras,
  })
}
