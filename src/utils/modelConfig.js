/**
 * 模型配置：DeepSeek 系列
 * 环境变量：VITE_DEEPSEEK_API_KEY（后端使用，前端仅用于展示/选择模型）
 */
export const modelOptions = [
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat (V3)",
    shortLabel: "DeepSeek Chat",
    model: "deepseek-ai/DeepSeek-V3",
    envKey: "VITE_DEEPSEEK_API_KEY",
    supportsVision: false,
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner (R1)",
    shortLabel: "DeepSeek R1",
    model: "deepseek-ai/DeepSeek-R1",
    envKey: "VITE_DEEPSEEK_API_KEY",
    supportsVision: false,
  },
  {
    id: "qwen-vl", 
    label: "Qwen3-VL (32B)",
    shortLabel: "Qwen VL",
    model: "Qwen/Qwen3-VL-32B-Instruct", 
    envKey: "VITE_DEEPSEEK_API_KEY",
    supportsVision: true, // 支持视觉识别
  },
];

const fallbackEnvKey = "VITE_DEEPSEEK_API_KEY";

/**
 * 根据模型配置获取 API Key（ DeepSeek 统一使用 VITE_DEEPSEEK_API_KEY）
 * @param {typeof modelOptions[0]} modelConfig
 * @returns {{ apiKey: string } | { error: string }}
 */
export function getApiKeyForModel(modelConfig) {
  const apiKey =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.[modelConfig?.envKey]) ||
    (typeof import.meta !== "undefined" && import.meta.env?.[fallbackEnvKey]);
  if (!apiKey) {
    return {
      error: `缺少 API Key，请在环境变量中设置 ${fallbackEnvKey}`,
    };
  }
  return { apiKey };
}

export function getModelById(id) {
  return modelOptions.find((m) => m.id === id) || modelOptions[0];
}
