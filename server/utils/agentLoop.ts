/**
 * Agent 循环 —— 通用的 LLM + 工具调用循环
 *
 * 用法：
 *   const result = await agentLoop({
 *     tools: [...],           // JSON Schema 格式的工具定义
 *     executeTool: (name, args) => { ... },  // 工具执行函数
 *     model: 'deepseek-v4-pro',
 *     system: '你是...',
 *     messages: [{ role: 'user', content: '...' }],
 *     maxSteps: 10,
 *   })
 *
 * 循环逻辑：
 *   LLM 返回 tool_calls → 执行工具 → 结果塞回 messages → 继续调 LLM
 *   直到 LLM 直接返回文本（不再调工具），或达到 maxSteps
 */

import { openai } from '../config'
import type { ChatMessage, AgentLoopOptions, AgentLoopResult } from '../types'

interface OpenAIResponseMessage {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

/** Agent 流式事件类型 */
export interface AgentStreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done' | 'error'
  toolName?: string
  args?: Record<string, unknown>
  result?: string
  steps?: Array<{ toolName: string; args: Record<string, unknown> }>
  text?: string
  error?: string
}

export async function agentLoop({
  tools,
  executeTool,
  model,
  system,
  messages,
  maxSteps = 10,
  logTag = 'agent',
  signal,
  client,
}: AgentLoopOptions): Promise<AgentLoopResult> {
  const steps: Array<{ toolName: string; args: Record<string, unknown> }> = []
  const openaiClient = client ?? openai
  const currentMessages: ChatMessage[] = [{ role: 'system', content: system }, ...messages]

  for (let i = 0; i < maxSteps; i++) {
    const response = await openaiClient.chat.completions.create(
      {
        model,
        messages: currentMessages as any[],
        tools: tools as any[],
        tool_choice: 'auto' as any,
        max_tokens: 2000,
      },
      { signal },
    )

    const msg = response.choices[0].message as OpenAIResponseMessage

    // LLM 直接回复文本 → 结束
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { text: msg.content || '', steps }
    }

    // LLM 调用了工具 → 先推一条 assistant 消息（携带本轮全部 tool_calls），
    // 再逐个执行，每个结果紧跟一条 tool 消息。不能为每条 tool_call 单独建
    // assistant 消息——OpenAI 协议要求一轮 tool_calls 只能出现在一条
    // assistant 消息里，且所有 tool 结果必须在同一轮之后按顺序跟上。
    currentMessages.push(buildAssistantMessage(msg))

    for (const tc of msg.tool_calls) {
      const fn = tc.function
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(fn.arguments || '{}')
      } catch {
        /* ignore parse errors */
      }

      steps.push({ toolName: fn.name, args })

      const result = await executeTool(fn.name, args, signal)
      const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result)
      console.log(
        `[${logTag}] ${fn.name}(${JSON.stringify(args).slice(0, 80)}) → ${resultStr.slice(0, 80)}`,
      )

      // 工具结果作为 tool 消息塞回 messages
      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultStr,
      })
    }
  }

  // 达到 maxSteps → 最后强制输出文本
  const finalResp = await openaiClient.chat.completions.create(
    {
      model,
      messages: [
        ...currentMessages,
        { role: 'user', content: '请基于以上工具调用结果，用中文给出最终回答。' },
      ] as any[],
      max_tokens: 2000,
    },
    { signal },
  )
  return { text: finalResp.choices[0].message.content || '', steps }
}

/**
 * 构建 assistant 消息：整条消息携带本轮全部 tool_calls，保留 reasoning_content 等字段
 */
function buildAssistantMessage(msg: OpenAIResponseMessage): ChatMessage {
  const result: ChatMessage = {
    role: 'assistant',
    content: msg.content || '',
    tool_calls: msg.tool_calls,
  }
  if (msg.reasoning_content) {
    result.reasoning_content = msg.reasoning_content
  }
  return result
}

// ===== 流式 Agent 循环 =====

/**
 * Agent 循环的流式版本 —— 每个关键步骤实时 yield 事件
 *
 * 事件类型：
 *   thinking     — LLM 正在思考（收到 tool_call 前）
 *   tool_call    — LLM 决定调用某个工具（{ toolName, args }）
 *   tool_result  — 工具执行完成（{ toolName, result }）
 *   done         — Agent 完成，携带最终结果
 *   error        — 异常终止
 *
 * 用途：
 *   前端通过 SSE 接收这些事件，实时渲染 Agent 的推理过程——
 *   "思考 → 搜知识库 → 拿到结果 → 评分 → 出追问" 每一步都可见。
 */
export async function* agentLoopStream({
  tools,
  executeTool,
  model,
  system,
  messages,
  maxSteps = 10,
  logTag = 'agent',
  signal,
  client,
}: AgentLoopOptions): AsyncGenerator<AgentStreamEvent> {
  const steps: Array<{ toolName: string; args: Record<string, unknown> }> = []
  const openaiClient = client ?? openai
  const currentMessages: ChatMessage[] = [{ role: 'system', content: system }, ...messages]

  for (let i = 0; i < maxSteps; i++) {
    // 通知前端：模型正在思考
    yield { type: 'thinking' }

    let response: any
    try {
      response = await openaiClient.chat.completions.create(
        {
          model,
          messages: currentMessages as any[],
          tools: tools as any[],
          tool_choice: 'auto' as any,
          max_tokens: 2000,
        },
        { signal },
      )
    } catch (err: any) {
      yield { type: 'error', error: `LLM 调用失败: ${err.message}` }
      return
    }

    const msg = response.choices[0].message as OpenAIResponseMessage

    // LLM 直接回复文本 → 结束
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      yield {
        type: 'done',
        text: msg.content || '',
        steps,
      }
      return
    }

    // LLM 调用了工具 → 先推一条 assistant 消息（携带本轮全部 tool_calls），
    // 再逐个执行，每个结果紧跟一条 tool 消息
    currentMessages.push(buildAssistantMessage(msg))

    for (const tc of msg.tool_calls) {
      const fn = tc.function
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(fn.arguments || '{}')
      } catch {
        /* ignore parse errors */
      }

      // 通知前端：工具调用已发起
      yield { type: 'tool_call', toolName: fn.name, args }

      let resultStr: string
      try {
        const result = await executeTool(fn.name, args, signal)
        resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result)
      } catch (err: any) {
        resultStr = `工具执行失败: ${err.message}`
      }

      console.log(
        `[${logTag}] ${fn.name}(${JSON.stringify(args).slice(0, 80)}) → ${resultStr.slice(0, 80)}`,
      )

      steps.push({ toolName: fn.name, args })

      // 通知前端：工具执行完毕（截断过长的结果，前端只需摘要）
      yield {
        type: 'tool_result',
        toolName: fn.name,
        result: resultStr.slice(0, 500),
      }

      // 工具结果作为 tool 消息塞回 messages
      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultStr,
      })
    }
  }

  // 达到 maxSteps → 最后强制输出文本
  try {
    const finalResp = await openaiClient.chat.completions.create(
      {
        model,
        messages: [
          ...currentMessages,
          { role: 'user', content: '请基于以上工具调用结果，用中文给出最终回答。' },
        ] as any[],
        max_tokens: 2000,
      },
      { signal },
    )
    yield {
      type: 'done',
      text: finalResp.choices[0].message.content || '',
      steps,
    }
  } catch (err: any) {
    yield { type: 'error', error: `最终输出失败: ${err.message}` }
  }
}
