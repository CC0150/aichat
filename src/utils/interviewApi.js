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
