import { apiRequest } from './apiClient'

/** Agent 流式事件回调 */
export interface AgentStreamCallbacks {
  onThinking?: () => void
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
  onToolResult?: (toolName: string, result: string) => void
  onDone?: (result: any) => void
  onError?: (error: string) => void
}

/** 请求 AI 评分 */
export function requestScore(body: {
  question: string
  answerPoints: string[]
  userAnswer: string
  model?: string
}): Promise<any> {
  return apiRequest('/api/interview/score', { method: 'POST', body })
}

/** 请求深度评估 */
export function requestEvaluate(body: {
  question: string
  answerPoints: string[]
  conversationHistory: Array<{ role: string; content: string }>
  model?: string
}): Promise<any> {
  return apiRequest('/api/interview/evaluate', { method: 'POST', body })
}

/** Agent 驱动评估 */
export function requestAgentEvaluate(body: {
  question: string
  answerPoints: string[]
  conversationHistory: Array<{ role: string; content: string }>
  kbId?: string
  model?: string
}): Promise<any> {
  return apiRequest('/api/interview/agent-evaluate', { method: 'POST', body })
}

/**
 * Agent 驱动评估 —— SSE 流式版本
 *
 * 实时接收 Agent 每一步操作：
 * - thinking: Agent 正在思考下一步
 * - tool_call: Agent 决定调用工具（显示工具卡片 + loading）
 * - tool_result: 工具执行完成（卡片更新为完成状态）
 * - done: Agent 评估完成，result 包含最终评分结果
 *
 * @param body   请求参数
 * @param cbs    事件回调
 * @param signal 用于中断的 AbortSignal
 */
export async function requestAgentEvaluateStream(
  body: {
    question: string
    answerPoints: string[]
    conversationHistory: Array<{ role: string; content: string }>
    kbId?: string
    model?: string
  },
  cbs: AgentStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/interview/agent-evaluate-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let msg = `请求失败: ${response.status}`
    try {
      const data = text ? JSON.parse(text) : null
      if (data?.error) msg = data.error
    } catch {
      /* ignore */
    }
    cbs.onError?.(msg)
    return
  }

  if (!response.body) {
    cbs.onError?.('响应体为空')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    let done: boolean
    let value: Uint8Array | undefined
    try {
      const result = await reader.read()
      done = result.done
      value = result.value
    } catch (err: any) {
      if (err.name === 'AbortError') return
      cbs.onError?.(err.message || '流读取失败')
      return
    }
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // 逐行解析 SSE data
    while (true) {
      const nl = buffer.indexOf('\n')
      if (nl === -1) break
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)

      if (!line.startsWith('data:') || line.startsWith('data: [DONE]')) continue
      const json = line.slice(5).trim()
      if (!json) continue

      let event: any
      try {
        event = JSON.parse(json)
      } catch {
        continue
      }

      switch (event.type) {
        case 'thinking':
          cbs.onThinking?.()
          break
        case 'tool_call':
          cbs.onToolCall?.(event.toolName, event.args || {})
          break
        case 'tool_result':
          cbs.onToolResult?.(event.toolName, event.result || '')
          break
        case 'done': {
          // 如果 done 携带了 JSON text，解析它
          if (event.text) {
            try {
              const parsed = JSON.parse(event.text)
              // 注入 agentSteps 到结果中
              parsed.agentSteps = event.steps || []
              cbs.onDone?.(parsed)
            } catch {
              cbs.onDone?.({ agentSteps: event.steps || [], text: event.text })
            }
          } else if (event.error) {
            cbs.onError?.(event.error)
          } else {
            cbs.onDone?.({ agentSteps: event.steps || [] })
          }
          return
        }
        case 'error':
          cbs.onError?.(event.error || '未知错误')
          return
      }
    }
  }
}

/** 根据文档内容生成面试题 */
export function requestGenerateQuestions(body: {
  content: string
  questionCount: number
  difficulty?: string
  model?: string
}): Promise<any> {
  return apiRequest('/api/questions/generate', { method: 'POST', body })
}

/** 根据岗位生成面试题 */
export function requestGenerateQuestionsByRole(body: {
  role: string
  questionCount: number
  difficulty?: string
  model?: string
}): Promise<any> {
  return apiRequest('/api/questions/generate-by-role', { method: 'POST', body })
}
