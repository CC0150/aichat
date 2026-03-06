/**
 * 模型配置：各模型对应的 API 名称与环境变量 Key
 * 环境变量：VITE_GLM_46V_API_KEY, VITE_GLM_46OCR_API_KEY，或通用 VITE_ZHIPU_API_KEY
 * 若 GLM-OCR 在对话接口仍报错，可能是该模型仅支持「文档解析」接口(layout_parsing)，需在控制台确认可用模型名。
 */
export const modelOptions = [
  {
    id: 'glm46v',
    label: 'GLM 4.6V',
    shortLabel: 'GLM 4.6V',
    model: 'glm-4.6v',
    envKey: 'VITE_GLM_46V_API_KEY',
  },
  {
    id: 'glm46ocr',
    label: 'GLM 4.6OCR',
    shortLabel: 'GLM 4.6OCR',
    model: 'glm-ocr', // 智谱文档中的模型 code，若控制台显示不同请在此修改
    envKey: 'VITE_GLM_46OCR_API_KEY',
  },
]

const fallbackEnvKey = 'VITE_ZHIPU_API_KEY'

/**
 * 根据模型配置获取 API Key（优先使用模型对应 envKey，否则回退到 VITE_ZHIPU_API_KEY）
 * @param {typeof modelOptions[0]} modelConfig
 * @returns {{ apiKey: string } | { error: string }}
 */
export function getApiKeyForModel(modelConfig) {
  const apiKey =
    (typeof import.meta !== 'undefined' && import.meta.env?.[modelConfig.envKey]) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.[fallbackEnvKey])
  if (!apiKey) {
    return {
      error: `缺少 API Key，请在环境变量中设置 ${modelConfig.envKey} 或 ${fallbackEnvKey}`,
    }
  }
  return { apiKey }
}

export function getModelById(id) {
  return modelOptions.find((m) => m.id === id) || modelOptions[0]
}
