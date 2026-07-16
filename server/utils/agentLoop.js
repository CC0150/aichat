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

const { openai } = require('../config')

/**
 * @param {{
 *   tools: Array<{ type: string, function: { name: string, description: string, parameters: object } }>,
 *   executeTool: (name: string, args: object) => Promise<string>,
 *   model: string,
 *   system: string,
 *   messages: Array<{ role: string, content: string }>,
 *   maxSteps?: number,
 *   logTag?: string,
 * }} opts
 * @returns {Promise<{ text: string, steps: Array<{ toolName: string, args: object }> }>}
 */
async function agentLoop({
  tools,
  executeTool,
  model,
  system,
  messages,
  maxSteps = 10,
  logTag = 'agent',
}) {
  const steps = []
  let currentMessages = [{ role: 'system', content: system }, ...messages]

  for (let i = 0; i < maxSteps; i++) {
    const response = await openai.chat.completions.create({
      model,
      messages: currentMessages,
      tools,
      tool_choice: 'auto',
      max_tokens: 2000,
    })

    const msg = response.choices[0].message

    // LLM 直接回复文本 → 结束
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { text: msg.content || '', steps }
    }

    // LLM 调用了工具 → 逐个执行
    for (const tc of msg.tool_calls) {
      const fn = tc.function
      let args = {}
      try {
        args = JSON.parse(fn.arguments || '{}')
      } catch (_) {}

      steps.push({ toolName: fn.name, args })

      const result = await executeTool(fn.name, args)
      const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result)
      console.log(
        `[${logTag}] ${fn.name}(${JSON.stringify(args).slice(0, 80)}) → ${resultStr.slice(0, 80)}`,
      )

      // 把工具调用和结果塞回 messages
      currentMessages.push(buildAssistantMessage(msg, tc))
      currentMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultStr,
      })
    }
  }

  // 达到 maxSteps → 最后强制输出文本
  const finalResp = await openai.chat.completions.create({
    model,
    messages: [
      ...currentMessages,
      { role: 'user', content: '请基于以上工具调用结果，用中文给出最终回答。' },
    ],
    max_tokens: 2000,
  })
  return { text: finalResp.choices[0].message.content || '', steps }
}

/**
 * 构建 assistant 消息，保留 reasoning_content 等字段
 */
function buildAssistantMessage(msg, tc) {
  return {
    role: 'assistant',
    ...('content' in msg ? { content: msg.content } : {}),
    ...('reasoning_content' in msg ? { reasoning_content: msg.reasoning_content } : {}),
    tool_calls: [tc],
  }
}

module.exports = { agentLoop }
