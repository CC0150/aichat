const { extractJson, repairJson } = require("../utils/parseJson")

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

  const extracted = extractJson(raw)
  try {
    return JSON.parse(extracted)
  } catch (firstError) {
    console.warn(`[${logTag}] 首次 JSON 解析失败，尝试修复...`)
    const repaired = repairJson(extracted)
    try {
      return JSON.parse(repaired)
    } catch {
      console.error(`[${logTag}] 修复后仍无法解析，原始内容:`, extracted.slice(0, 300))
      throw firstError
    }
  }
}

module.exports = { callAI }
