import dotenv from 'dotenv'
import path from 'path'

// 确保在任何 env 读取之前加载 server/.env（import 在 CommonJS 下会被提升，此处放模块顶部即可）
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

import OpenAI from 'openai'

export const PORT = process.env.PORT || 8787
export const API_KEY = process.env.DEEPSEEK_API_KEY
export const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
export const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
export const VALID_MODELS = new Set<string>(['deepseek-v4-flash', 'deepseek-v4-pro'])

export function sanitizeModel(model: string): string {
  return VALID_MODELS.has(model) ? model : DEFAULT_MODEL
}

let _openai: OpenAI | null = null

/**
 * 懒加载 OpenAI 客户端 —— 避免启动时因缺少 API_KEY 直接崩溃，
 * 让 health check 等非 AI 路由在无 key 时仍可正常响应
 */
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: API_KEY,
      baseURL: BASE_URL,
      timeout: 60000,
    })
  }
  return _openai
}

/**
 * 延迟代理：所有 openai.xxx 调用自动转发到懒加载的 OpenAI 实例
 * 兼容原来的 import { openai } from '../config' 用法
 */
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop: string | symbol) {
    return (getOpenAI() as any)[prop]
  },
})
