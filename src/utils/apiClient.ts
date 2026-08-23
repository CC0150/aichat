/**
 * 统一的 API 请求封装
 */
export async function apiRequest(
  url: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {},
): Promise<any> {
  const { method = 'GET', body, headers, signal, ...rest } = options
  const fetchOptions: RequestInit & { headers: Record<string, string> } = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    signal,
    ...rest,
  }
  if (body != null) {
    fetchOptions.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(url, fetchOptions)
  } catch (err: any) {
    throw new Error(`网络请求失败：${err.message || '无法连接到服务器'}`)
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `请求失败：${response.status}`)
  }

  return response.json()
}
