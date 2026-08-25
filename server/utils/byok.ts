import type OpenAI from 'openai'
import { createOpenAI, DEFAULT_MODEL } from '../config'

export interface ByokClient {
  /** 自定义供应商客户端；未启用自定义时为 undefined（路由沿用平台 openai） */
  client?: OpenAI
  /** 生效的模型名：自定义时原样放行，未自定义时原样返回由路由完成白名单校验 */
  model: string
}

/**
 * 从请求体解析"用户自带 Key"（BYOK）供应商。
 * 仅当 baseUrl 与 apiKey 都提供时才启用自定义；否则返回 client=undefined，
 * 由路由沿用平台的 sanitizeModel 白名单。用户 key 只存活于本次请求：不持久化、不打印。
 */
export function byokFromBody(body: unknown): ByokClient {
  const b = (body ?? {}) as Record<string, unknown>
  const apiKey = typeof b.apiKey === 'string' ? b.apiKey.trim().slice(0, 200) : ''
  const baseUrl = typeof b.baseUrl === 'string' ? b.baseUrl.trim().slice(0, 300) : ''
  const isCustom = !!(apiKey && /^https?:\/\//i.test(baseUrl))
  const client = isCustom ? createOpenAI({ baseURL: baseUrl, apiKey }) : undefined
  const model = typeof b.model === 'string' ? b.model.trim().slice(0, 100) : ''
  return { client, model: isCustom ? model || DEFAULT_MODEL : model }
}
