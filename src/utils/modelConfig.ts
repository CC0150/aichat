import type { ModelOption } from '@/types'

export const modelOptions: ModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    shortLabel: 'V4 Flash',
    model: 'deepseek-v4-flash',
    contextWindow: 128000,
    supportsVision: false,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    shortLabel: 'V4 Pro',
    model: 'deepseek-v4-pro',
    contextWindow: 128000,
    supportsVision: false,
  },
]

export function getModelById(id: string): ModelOption {
  return modelOptions.find((m) => m.id === id) || modelOptions[0]
}
