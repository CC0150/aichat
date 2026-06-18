const OpenAI = require("openai");

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const VALID_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
const sanitizeModel = (model) => (VALID_MODELS.has(model) ? model : DEFAULT_MODEL);

const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
  timeout: 60000,
});

module.exports = { PORT, API_KEY, BASE_URL, DEFAULT_MODEL, VALID_MODELS, sanitizeModel, openai };
