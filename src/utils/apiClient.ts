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
  const isFormData = body instanceof FormData
  const fetchOptions: RequestInit & { headers: Record<string, string> } = {
    method,
    // FormData 让浏览器自动设置 multipart boundary，不能手写 Content-Type
    headers: isFormData ? { ...headers } : { 'Content-Type': 'application/json', ...headers },
    signal,
    ...rest,
  }
  if (body != null) {
    fetchOptions.body = isFormData ? body : JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(url, fetchOptions)
  } catch (err: any) {
    throw new Error(`网络请求失败：${err.message || '无法连接到服务器'}`)
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    // 会话过期/未登录：排除 auth 接口（登录失败不该触发跳转），其余跳到登录页
    if (response.status === 401 && !url.includes('/api/auth')) {
      if (window.location.pathname !== '/login') {
        window.location.assign(`/login?reason=expired`)
      }
      throw new Error('登录已失效，请重新登录')
    }
    throw new Error(data.error || `请求失败：${response.status}`)
  }

  return response.json()
}
