import type { SanitizeOptions } from '../types'

/**
 * 校验并清理字符串字段
 */
export function sanitizeString(
  value: unknown,
  { maxLength = 5000, required = true }: SanitizeOptions = {},
): string | null {
  if (value == null) return required ? null : ''
  const str = String(value).trim()
  if (required && str.length === 0) return null
  return str.slice(0, maxLength)
}

/**
 * 校验枚举值
 */
export function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  default_: T | null = null,
): T | null {
  if (value == null && default_ !== null) return default_
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  return default_
}

/**
 * 校验数字范围
 */
export function clampNumber(value: unknown, min = 1, max = 20, default_ = 5): number {
  if (value == null || typeof value !== 'number') return default_
  return Math.min(Math.max(Math.round(value), min), max)
}
