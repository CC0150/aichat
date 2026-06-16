/**
 * 统一的 API 请求封装
 * @param {string} url
 * @param {{ method?: string, body?: any, headers?: object, signal?: AbortSignal }} options
 * @returns {Promise<any>} JSON 响应
 */
export async function apiRequest(url, options = {}) {
  const { method = 'GET', body, headers, signal, ...rest } = options
  const fetchOptions = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    signal,
    ...rest,
  }
  if (body != null) {
    fetchOptions.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(url, fetchOptions)
  } catch (err) {
    throw new Error(`网络请求失败：${err.message || '无法连接到服务器'}`)
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `请求失败：${response.status}`)
  }

  return response.json()
}
