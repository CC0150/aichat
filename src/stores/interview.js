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
    const conversations = ref({})            // { [questionId]: [{ role:'user'|'assistant', content }] } 多轮对话记录
    const isCustomMode = ref(false)          // 是否为自定义题目模式（文件出题 / AI 生成）
    const customSource = ref('')             // 自定义题目的来源描述（文件名等）
    const startedAt = ref(null)              // 面试开始时间

    // ===== 历史记录 =====
    const history = ref([])                  // 每次完成的面试记录 [{ id, type, questions, answers, scores, startedAt, finishedAt, totalScore }]

    // ===== 计算属性 =====
    const currentQuestion = computed(() =>
      questions.value[currentIndex.value] || null
    )

    /** 当前题目的多轮对话历史 */
    const currentConversation = computed(() =>
      conversations.value[currentQuestion.value?.id] || []
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
      conversations.value = {}
      isCustomMode.value = false
      customSource.value = ''
      phase.value = "answering"
      startedAt.value = new Date().toISOString()
      return true
    }

    /** 加载自定义题目（文件出题 / AI 生成），直接进入答题状态 */
    function loadCustomQuestions(questionsList, source = '') {
      if (!Array.isArray(questionsList) || questionsList.length === 0) return false
      // 补全必要字段
      const timestamp = Date.now()
      questions.value = questionsList.map((q, i) => ({
        id: q.id || `custom-${timestamp}-${i}`,
        type: q.type || 'concept',
        category: q.category || 'custom',
        difficulty: q.difficulty || 'medium',
        tags: Array.isArray(q.tags) ? q.tags : (q.knowledgePoints || []).slice(0, 3),
        knowledgePoints: Array.isArray(q.knowledgePoints) ? q.knowledgePoints : [],
        question: q.question || '',
        answerPoints: Array.isArray(q.answerPoints) ? q.answerPoints : [],
      }))
      interviewType.value = 'custom'
      currentIndex.value = 0
      answers.value = {}
      scores.value = {}
      conversations.value = {}
      phase.value = 'answering'
      startedAt.value = new Date().toISOString()
      isCustomMode.value = true
      customSource.value = source
      return true
    }

    /** 提交答案，进入评分/评估阶段 */
    function submitAnswer(questionId, answer, useDeepMode = false) {
      answers.value[questionId] = answer
      if (useDeepMode) {
        // 追加到对话记录
        appendToConversation(questionId, "user", answer)
      }
      phase.value = "scoring"
    }

    /** 追加消息到某题的对话记录 */
    function appendToConversation(questionId, role, content) {
      if (!conversations.value[questionId]) {
        conversations.value[questionId] = []
      }
      conversations.value[questionId].push({ role, content })
    }

    /** 保存 AI 评分结果（普通模式） */
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

    /** 处理深度评估结果（多轮追问模式） */
    function handleEvaluateResult(questionId, result) {
      if (result.action === "follow_up") {
        // 记录 AI 追问，回到答题状态
        appendToConversation(questionId, "assistant", result.followUpQuestion)
        phase.value = "answering"
        return "follow_up"
      }
      // action === "complete"，保存最终评分
      saveScore(questionId, {
        score: result.score,
        correctness: result.correctness,
        completeness: result.completeness,
        clarity: result.clarity,
        feedback: result.feedback,
        improvedAnswer: result.improvedAnswer,
      })
      return "complete"
    }

    /** 跳转到指定题目 */
    function goToQuestion(index) {
      if (index < 0 || index >= questions.value.length) return
      currentIndex.value = index
      const q = questions.value[index]
      if (scores.value[q.id]) {
        phase.value = "feedback"
      } else if (conversations.value[q.id]?.length) {
        // 有对话记录但未完成评分 → 回到回答阶段继续追问
        phase.value = "answering"
      } else {
        phase.value = "answering"
      }
    }

    /** 重置当前题目的状态（跳题或切题时调用） */
    function resetCurrentQuestionState(qId) {
      // 清除该题的对话记录和评分（如果未完成）
      if (qId && conversations.value[qId] && !scores.value[qId]) {
        delete conversations.value[qId]
      }
    }

    /** 进入下一题或结束面试 */
    function nextQuestion() {
      const curQId = currentQuestion.value?.id
      if (isLastQuestion.value) {
        finishInterview()
      } else {
        resetCurrentQuestionState(curQId)
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
        conversations: { ...conversations.value },
        isCustomMode: isCustomMode.value,
        customSource: customSource.value,
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
      conversations.value = {}
      isCustomMode.value = false
      customSource.value = ''
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
      conversations,
      isCustomMode,
      customSource,
      startedAt,
      history,
      currentQuestion,
      currentConversation,
      progress,
      isLastQuestion,
      totalScore,
      knowledgePointStats,
      categoryStats,
      weakPoints,
      overallStats,
      startInterview,
      loadCustomQuestions,
      submitAnswer,
      appendToConversation,
      saveScore,
      handleEvaluateResult,
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
