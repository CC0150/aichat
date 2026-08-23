/**
 * 从 AI 原始返回中提取 JSON 字符串
 * - 去除 markdown 代码块包裹
 * - 自动检测对象 {} 或数组 []
 */
export function extractJson(raw: string): string {
  let jsonStr = raw.trim()

  // 去除 markdown 代码块包裹
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonMatch) jsonStr = jsonMatch[1]

  // 优先检测对象
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  // 检测数组
  const firstBracket = jsonStr.indexOf('[')
  const lastBracket = jsonStr.lastIndexOf(']')

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

/**
 * 修复 AI 返回的常见 JSON 格式问题
 * 1. 字符串内未转义的换行符 → \\n
 * 2. 未转义的双引号 → \\"
 * 3. 缺失的闭合括号
 */
export function repairJson(str: string): string {
  let repaired = str

  // 在 JSON 字符串上下文中修复未转义的换行符（在双引号范围内）
  repaired = fixUnescapedChars(repaired)

  // 修复截断：如果最后一个未闭合的是字符串值，补上引号
  repaired = fixTruncatedString(repaired)

  // 补齐缺失的闭合括号/方括号
  const openBraces = (repaired.match(/(?<!\\){/g) || []).length
  const closeBraces = (repaired.match(/(?<!\\)}/g) || []).length
  const openBrackets = (repaired.match(/(?<!\\)\[/g) || []).length
  const closeBrackets = (repaired.match(/(?<!\\)\]/g) || []).length

  for (let i = openBraces; i > closeBraces; i--) repaired += '}'
  for (let i = openBrackets; i > closeBrackets; i--) repaired += ']'

  return repaired
}

/**
 * 修复因 AI 输出被截断导致的未闭合字符串
 * 如果 JSON 末尾正处在一个打开的字符串内 → 补上闭合引号 + "...(截断)"
 */
function fixTruncatedString(str: string): string {
  let inString = false
  let escaped = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
    }
  }

  // 如果遍历结束时 inString 为 true，说明字符串没有闭合
  if (inString) {
    return str + '(截断)"'
  }
  return str
}

/**
 * 修复 JSON 字符串中未转义的换行符
 * 在 JSON 字符串值内，真实的换行符必须转义为 \\n
 */
function fixUnescapedChars(str: string): string {
  const result: string[] = []
  let inString = false
  let escaped = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    if (escaped) {
      result.push(ch)
      escaped = false
      continue
    }

    if (ch === '\\') {
      result.push(ch)
      escaped = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      result.push(ch)
      continue
    }

    // 在 JSON 字符串值内部，真实的换行符需要转义
    if (inString && ch === '\n') {
      result.push('\\n')
      continue
    }
    if (inString && ch === '\r') {
      result.push('\\r')
      continue
    }

    result.push(ch)
  }

  return result.join('')
}
