/**
 * 共享输入校验工具
 */

/**
 * 校验并清理字符串字段
 * @returns {string|null} 清理后的字符串，无效时返回 null
 */
function sanitizeString(value, { maxLength = 5000, required = true } = {}) {
  if (value == null) return required ? null : ""
  const str = String(value).trim()
  if (required && str.length === 0) return null
  return str.slice(0, maxLength)
}

/**
 * 校验枚举值
 * @returns {string|null} 合法值，无效时返回 null
 */
function validateEnum(value, allowed, default_ = null) {
  if (value == null && default_ !== null) return default_
  if (allowed.includes(value)) return value
  return default_
}

/**
 * 校验数字范围
 * @returns {number} 钳制后的数字
 */
function clampNumber(value, min = 1, max = 20, default_ = 5) {
  if (value == null || typeof value !== "number") return default_
  return Math.min(Math.max(Math.round(value), min), max)
}

module.exports = { sanitizeString, validateEnum, clampNumber }
