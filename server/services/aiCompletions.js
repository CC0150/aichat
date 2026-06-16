const { extractJson } = require("../utils/parseJson")

/**
 * 调用 AI 并解析 JSON 返回（非流式）
 * @param {{ model: string, prompt: string, temperature?: number, maxTokens?: number, logTag?: string }} params
 * @returns {Promise<any>} 解析后的 JSON 结果
 */
async function callAI({ model, prompt, temperature = 0.5, maxTokens = 2000, logTag = "ai" }) {
  const { openai } = require("../config")
  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    max_tokens: maxTokens,
  })
  const raw = response.choices[0]?.message?.content || ""
  console.log(`[${logTag}] AI 原始返回:`, raw.slice(0, 200))
  return JSON.parse(extractJson(raw))
}

module.exports = { callAI }
