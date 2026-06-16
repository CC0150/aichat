/**
 * 统一的 AI 调用错误处理
 * @param {import('express').Response} res
 * @param {Error} err
 * @param {string} logTag - 日志标签
 * @param {{ fallbackMessage?: string, extras?: object }} opts
 */
function handleAIError(res, err, logTag, { fallbackMessage, extras = {} } = {}) {
  const msg = fallbackMessage || "服务异常"
  console.error(`[${logTag}] 失败:`, err.message)
  if (err instanceof SyntaxError) {
    console.error(`[${logTag}] JSON 解析失败`)
  }
  res.status(502).json({
    error: err?.message || msg,
    retryable: true,
    ...extras,
  })
}

module.exports = { handleAIError }
