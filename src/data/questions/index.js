import htmlQuestions from "./html.js"
import cssQuestions from "./css.js"
import jsQuestions from "./js.js"
import vueQuestions from "./vue.js"
import reactQuestions from "./react.js"
import engineeringQuestions from "./engineering.js"

/** 全量题库 */
export const allQuestions = [
  ...htmlQuestions,
  ...cssQuestions,
  ...jsQuestions,
  ...vueQuestions,
  ...reactQuestions,
  ...engineeringQuestions,
]

/** 题库分组，便于按分类筛选 */
export const questionsByCategory = {
  html: htmlQuestions,
  css: cssQuestions,
  javascript: jsQuestions,
  vue: vueQuestions,
  react: reactQuestions,
  engineering: engineeringQuestions,
}

/** 面试类型预设 */
export const interviewTypes = {
  "frontend": {
    label: "前端综合面试",
    description: "覆盖 HTML、CSS、JS、Vue、React、工程化",
    categories: ["html", "css", "javascript", "vue", "react", "engineering"],
    questionCount: 10,
  },
  "js-core": {
    label: "JS 核心",
    description: "JavaScript 基础、异步、原型等核心知识点",
    categories: ["javascript"],
    questionCount: 6,
  },
  "vue-special": {
    label: "Vue 专项",
    description: "Vue 3 响应式、组件、性能优化",
    categories: ["vue"],
    questionCount: 5,
  },
  "css-html": {
    label: "HTML + CSS",
    description: "布局、盒模型、响应式、语义化",
    categories: ["html", "css"],
    questionCount: 6,
  },
}

/**
 * 按配置从题库中选题
 * @param {Object} config
 * @param {string} config.interviewType - 面试类型 key
 * @param {number} [config.questionCount] - 覆盖默认题数
 * @param {string} [config.difficulty] - 难度筛选：'all' | 'easy' | 'medium' | 'hard'，默认 'all'
 * @returns {Array} 选中的题目列表（按难度由易到难排序）
 */
export function selectQuestions({ interviewType, questionCount, difficulty = "all" }) {
  const typeConfig = interviewTypes[interviewType]
  if (!typeConfig) return []

  const count = questionCount || typeConfig.questionCount
  const categories = typeConfig.categories

  // 从指定分类中收集所有题目
  let pool = []
  for (const cat of categories) {
    if (questionsByCategory[cat]) {
      pool = pool.concat(questionsByCategory[cat])
    }
  }

  // 按难度筛选
  if (difficulty !== "all") {
    pool = pool.filter((q) => q.difficulty === difficulty)
  }

  if (pool.length === 0) return []

  // 指定难度时直接随机抽取，不再分层
  if (difficulty !== "all") {
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(count, pool.length))
  }

  // 全难度时按比例分层抽取（简单 40% + 中等 40% + 困难 20%）
  const easy = pool.filter((q) => q.difficulty === "easy")
  const medium = pool.filter((q) => q.difficulty === "medium")
  const hard = pool.filter((q) => q.difficulty === "hard")

  // 按比例分层抽取（简单 40% + 中等 40% + 困难 20%）
  const easyCount = Math.round(count * 0.4)
  const mediumCount = Math.round(count * 0.4)
  const hardCount = count - easyCount - mediumCount

  function pickRandom(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, Math.min(n, arr.length))
  }

  const selected = [
    ...pickRandom(easy, easyCount),
    ...pickRandom(medium, mediumCount),
    ...pickRandom(hard, hardCount),
  ]

  // 按难度排序（easy → medium → hard），同难度随机顺序
  const difficultyOrder = { easy: 0, medium: 1, hard: 2 }
  selected.sort(
    (a, b) =>
      difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty] ||
      Math.random() - 0.5
  )

  // 如果抽取的不够（某些难度题量不足），用随机补充
  if (selected.length < count) {
    const selectedIds = new Set(selected.map((q) => q.id))
    const remaining = pool.filter((q) => !selectedIds.has(q.id))
    const extra = pickRandom(remaining, count - selected.length)
    selected.push(...extra)
  }

  return selected
}

/** 根据 id 获取单道题 */
export function getQuestionById(id) {
  return allQuestions.find((q) => q.id === id) || null
}

/** 获取所有知识点列表（去重） */
export function getAllKnowledgePoints() {
  const set = new Set()
  for (const q of allQuestions) {
    for (const kp of q.knowledgePoints) {
      set.add(kp)
    }
  }
  return [...set]
}
