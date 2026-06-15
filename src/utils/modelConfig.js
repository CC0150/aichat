export const modelOptions = [
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    shortLabel: "V4 Flash",
    model: "deepseek-v4-flash",
    supportsVision: false,
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    shortLabel: "V4 Pro",
    model: "deepseek-v4-pro",
    supportsVision: false,
  },
];

export function getModelById(id) {
  return modelOptions.find((m) => m.id === id) || modelOptions[0];
}
