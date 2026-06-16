/**
 * 从 AI 原始返回中提取 JSON 字符串
 * - 去除 markdown 代码块包裹
 * - 自动检测对象 {} 或数组 []
 * @param {string} raw AI 返回的原始文本
 * @returns {string} 提取后的 JSON 字符串
 */
function extractJson(raw) {
  let jsonStr = raw.trim()

  // 去除 markdown 代码块包裹
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) jsonStr = jsonMatch[1]

  // 优先检测对象
  const firstBrace = jsonStr.indexOf("{")
  const lastBrace = jsonStr.lastIndexOf("}")
  // 检测数组
  const firstBracket = jsonStr.indexOf("[")
  const lastBracket = jsonStr.lastIndexOf("]")

  // 取最先出现的合法括号对
  let start = -1
  let end = -1

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    start = firstBrace
    end = lastBrace + 1
  }
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    if (start === -1 || firstBracket < start) {
      start = firstBracket
      end = lastBracket + 1
    }
  }

  if (start !== -1 && end > start) {
    jsonStr = jsonStr.slice(start, end)
  }

  return jsonStr
}

module.exports = { extractJson }
