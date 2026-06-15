const SCORE_API_URL = "/api/interview/score"

/**
 * 调用 AI 评分接口
 * @param {{ question: string, answerPoints: string[], userAnswer: string, model?: string }} params
 * @returns {Promise<{ score, correctness, completeness, clarity, feedback, improvedAnswer }>}
 */
export async function requestScore({ question, answerPoints, userAnswer, model }) {
  const response = await fetch(SCORE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answerPoints, userAnswer, model }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `评分请求失败：${response.status}`)
  }

  return response.json()
}

const EVALUATE_API_URL = "/api/interview/evaluate"

/**
 * 深度面试评估接口（支持多轮追问）
 * @param {{ question: string, answerPoints: string[], conversationHistory: Array<{role:string, content:string}>, model?: string }} params
 * @returns {Promise<{ action: 'follow_up'|'complete', followUpQuestion?, scoreHint?, score?, correctness?, completeness?, clarity?, feedback?, improvedAnswer? }>}
 */
export async function requestEvaluate({ question, answerPoints, conversationHistory, model }) {
  const response = await fetch(EVALUATE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answerPoints, conversationHistory, model }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `评估请求失败：${response.status}`)
  }

  return response.json()
}

const QUESTIONS_API_URL = "/api/questions/generate"
const ROLE_QUESTIONS_API_URL = "/api/questions/generate-by-role"

/**
 * 根据文档内容 AI 生成面试题
 * @param {{ content: string, questionCount: number, difficulty: string, model?: string }} params
 * @returns {Promise<{ questions: Array, error?: string }>}
 */
export async function requestGenerateQuestions({ content, questionCount, difficulty, model }) {
  const response = await fetch(QUESTIONS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, questionCount, difficulty, model }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `题目生成失败：${response.status}`)
  }

  return response.json()
}

/**
 * 根据目标岗位 AI 生成面试题
 * @param {{ role: string, questionCount: number, difficulty: string, model?: string }} params
 * @returns {Promise<{ questions: Array, error?: string }>}
 */
export async function requestGenerateQuestionsByRole({ role, questionCount, difficulty, model }) {
  const response = await fetch(ROLE_QUESTIONS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, questionCount, difficulty, model }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `题目生成失败：${response.status}`)
  }

  return response.json()
}
