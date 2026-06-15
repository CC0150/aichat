import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { selectQuestions, interviewTypes, getQuestionById } from "@/data/questions/index.js"

export const useInterviewStore = defineStore(
  "interview",
  () => {
    // ===== 面试会话 =====
    const interviewType = ref(null)          // 当前面试类型 key
    const questions = ref([])                // 本轮题目列表
    const currentIndex = ref(0)              // 当前题目下标
    const phase = ref("idle")                // idle | answering | scoring | feedback | finished
    const answers = ref({})                  // { [questionId]: userAnswer }
    const scores = ref({})                   // { [questionId]: { score, correctness, completeness, clarity, feedback, improvedAnswer } }
    const startedAt = ref(null)              // 面试开始时间

    // ===== 历史记录 =====
    const history = ref([])                  // 每次完成的面试记录 [{ id, type, questions, answers, scores, startedAt, finishedAt, totalScore }]

    // ===== 计算属性 =====
    const currentQuestion = computed(() =>
      questions.value[currentIndex.value] || null
    )

    const progress = computed(() => ({
      current: currentIndex.value + 1,
      total: questions.value.length,
      percentage: questions.value.length
        ? Math.round(((currentIndex.value + 1) / questions.value.length) * 100)
        : 0,
    }))

    const isLastQuestion = computed(() =>
      currentIndex.value >= questions.value.length - 1
    )

    const totalScore = computed(() => {
      const values = Object.values(scores.value)
      if (values.length === 0) return 0
      return Math.round(values.reduce((sum, s) => sum + (s.score || 0), 0) / values.length * 10) / 10
    })

    // 按知识点聚合得分率（用于雷达图）
    const knowledgePointStats = computed(() => {
      const map = {}
      for (const q of questions.value) {
        const s = scores.value[q.id]
        if (!s) continue
        for (const kp of q.knowledgePoints) {
          if (!map[kp]) map[kp] = { total: 0, count: 0 }
          map[kp].total += s.score || 0
          map[kp].count += 1
        }
      }
      const result = {}
      for (const [kp, stat] of Object.entries(map)) {
        result[kp] = Math.round((stat.total / stat.count) * 10) / 10
      }
      return result
    })

    /** 各分类平均分（用于按分类统计） */
    const categoryStats = computed(() => {
      const map = {}
      for (const q of questions.value) {
        const s = scores.value[q.id]
        if (!s) continue
        if (!map[q.category]) map[q.category] = { total: 0, count: 0 }
        map[q.category].total += s.score || 0
        map[q.category].count += 1
      }
      const result = {}
      for (const [cat, stat] of Object.entries(map)) {
        result[cat] = Math.round((stat.total / stat.count) * 10) / 10
      }
      return result
    })

    /** 薄弱知识点（得分 < 5 的） */
    const weakPoints = computed(() => {
      const stats = knowledgePointStats.value
      return Object.entries(stats)
        .filter(([, score]) => score < 5)
        .map(([kp, score]) => ({ knowledgePoint: kp, score }))
        .sort((a, b) => a.score - b.score)
    })

    /** 面试历史总统计 */
    const overallStats = computed(() => {
      if (history.value.length === 0) return null
      const totalInterviews = history.value.length
      const avgScore = Math.round(
        history.value.reduce((sum, h) => sum + h.totalScore, 0) / totalInterviews * 10
      ) / 10
      const recentInterviews = [...history.value]
        .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt))
        .slice(0, 10)
      const scoreTrend = recentInterviews.map((h) => ({
        date: new Date(h.finishedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }),
        score: h.totalScore,
      })).reverse()
      return { totalInterviews, avgScore, scoreTrend }
    })

    // ===== 操作 =====

    /** 开始一轮新面试 */
    function startInterview(typeKey, customCount, difficulty = "all") {
      const typeConfig = interviewTypes[typeKey]
      if (!typeConfig) return false

      const selected = selectQuestions({
        interviewType: typeKey,
        questionCount: customCount || typeConfig.questionCount,
        difficulty,
      })
      if (selected.length === 0) return false

      interviewType.value = typeKey
      questions.value = selected
      currentIndex.value = 0
      answers.value = {}
      scores.value = {}
      phase.value = "answering"
      startedAt.value = new Date().toISOString()
      return true
    }

    /** 提交答案，进入评分阶段 */
    function submitAnswer(questionId, answer) {
      answers.value[questionId] = answer
      phase.value = "scoring"
    }

    /** 保存 AI 评分结果 */
    function saveScore(questionId, scoreData) {
      scores.value[questionId] = {
        score: scoreData.score ?? 0,
        correctness: scoreData.correctness ?? 0,
        completeness: scoreData.completeness ?? 0,
        clarity: scoreData.clarity ?? 0,
        feedback: scoreData.feedback ?? "",
        improvedAnswer: scoreData.improvedAnswer ?? "",
      }
      phase.value = "feedback"
    }

    /** 跳转到指定题目 */
    function goToQuestion(index) {
      if (index < 0 || index >= questions.value.length) return
      currentIndex.value = index
      const q = questions.value[index]
      if (scores.value[q.id]) {
        phase.value = "feedback"
      } else {
        phase.value = "answering"
      }
    }

    /** 进入下一题或结束面试 */
    function nextQuestion() {
      if (isLastQuestion.value) {
        finishInterview()
      } else {
        currentIndex.value++
        phase.value = "answering"
      }
    }

    /** 结束面试，存入历史 */
    function finishInterview() {
      phase.value = "finished"
      const finishedAt = new Date().toISOString()
      history.value.unshift({
        id: Date.now().toString(),
        type: interviewType.value,
        typeLabel: interviewTypes[interviewType.value]?.label || "",
        questions: [...questions.value],
        answers: { ...answers.value },
        scores: { ...scores.value },
        startedAt: startedAt.value,
        finishedAt,
        totalScore: totalScore.value,
      })
    }

    /** 重置当前面试（放弃） */
    function resetInterview() {
      interviewType.value = null
      questions.value = []
      currentIndex.value = 0
      phase.value = "idle"
      answers.value = {}
      scores.value = {}
      startedAt.value = null
    }

    /** 清除所有历史 */
    function clearHistory() {
      history.value = []
    }

    /** 删除单条历史记录 */
    function deleteHistoryRecord(id) {
      history.value = history.value.filter((h) => h.id !== id)
    }

    /** 批量删除历史记录 */
    function deleteHistoryRecords(ids) {
      const idSet = new Set(ids)
      history.value = history.value.filter((h) => !idSet.has(h.id))
    }

    return {
      interviewType,
      questions,
      currentIndex,
      phase,
      answers,
      scores,
      startedAt,
      history,
      currentQuestion,
      progress,
      isLastQuestion,
      totalScore,
      knowledgePointStats,
      categoryStats,
      weakPoints,
      overallStats,
      startInterview,
      submitAnswer,
      saveScore,
      nextQuestion,
      goToQuestion,
      finishInterview,
      resetInterview,
      clearHistory,
      deleteHistoryRecord,
      deleteHistoryRecords,
    }
  },
  { persist: true }
)
