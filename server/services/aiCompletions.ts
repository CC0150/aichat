import { openai } from '../config'
import { extractJson, repairJson } from '../utils/parseJson'
import type { CallAIParams } from '../types'

/**
 * 调用 AI 并解析 JSON 返回（非流式）
 */
export async function callAI({
  model,
  prompt,
  temperature = 0.5,
  maxTokens = 2000,
  logTag = 'ai',
  signal,
}: CallAIParams): Promise<any> {
  const response = await openai.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    },
    { signal },
  )
  const raw = response.choices[0]?.message?.content || ''
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
