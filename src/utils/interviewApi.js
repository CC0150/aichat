import { apiRequest } from './apiClient'

const SCORE_API_URL = '/api/interview/score'
const EVALUATE_API_URL = '/api/interview/evaluate'
const QUESTIONS_API_URL = '/api/questions/generate'
const ROLE_QUESTIONS_API_URL = '/api/questions/generate-by-role'

function request(url, body) {
  return apiRequest(url, { method: 'POST', body })
}

/**
 * 调用 AI 评分接口
 * @param {{ question: string, answerPoints: string[], userAnswer: string, model?: string }} params
 * @returns {Promise<{ score, correctness, completeness, clarity, feedback, improvedAnswer }>}
 */
export async function requestScore({ question, answerPoints, userAnswer, model }) {
  return request(SCORE_API_URL, { question, answerPoints, userAnswer, model })
}

/**
 * 深度面试评估接口（支持多轮追问）
 * @param {{ question: string, answerPoints: string[], conversationHistory: Array<{role:string, content:string}>, model?: string }} params
 * @returns {Promise<{ action: 'follow_up'|'complete', followUpQuestion?, scoreHint?, score?, correctness?, completeness?, clarity?, feedback?, improvedAnswer? }>}
 */
export function requestEvaluate({ question, answerPoints, conversationHistory, model }) {
  return request(EVALUATE_API_URL, { question, answerPoints, conversationHistory, model })
}

/**
 * 根据文档内容 AI 生成面试题
 * @param {{ content: string, questionCount: number, difficulty: string, model?: string }} params
 * @returns {Promise<{ questions: Array, error?: string }>}
 */
export function requestGenerateQuestions({ content, questionCount, difficulty, model }) {
  return request(QUESTIONS_API_URL, { content, questionCount, difficulty, model })
}

/**
 * 根据目标岗位 AI 生成面试题
 * @param {{ role: string, questionCount: number, difficulty: string, model?: string }} params
 * @returns {Promise<{ questions: Array, error?: string }>}
 */
export function requestGenerateQuestionsByRole({ role, questionCount, difficulty, model }) {
  return request(ROLE_QUESTIONS_API_URL, { role, questionCount, difficulty, model })
}
