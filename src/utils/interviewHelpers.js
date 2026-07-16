export const difficultyMap = { easy: '简单', medium: '中等', hard: '困难' }
export const difficultyColor = {
  easy: 'bg-emerald-500/10 text-emerald-500',
  medium: 'bg-amber-500/10 text-amber-500',
  hard: 'bg-red-500/10 text-red-500',
}

export function getScoreColor(score) {
  if (score >= 8) return 'text-emerald-500'
  if (score >= 5) return 'text-amber-500'
  return 'text-red-500'
}

export function getScoreBg(score) {
  if (score >= 8) return 'bg-emerald-500/10'
  if (score >= 5) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

export function getScoreBgSolid(score) {
  if (score >= 8) return 'bg-emerald-500'
  if (score >= 5) return 'bg-amber-500'
  return 'bg-red-500'
}

export function getScoreLabel(score) {
  if (score >= 8) return '优秀'
  if (score >= 5) return '良好'
  return '需提升'
}

/**
 * 计算单条面试记录的分类平均分
 * @param {{ questions: Array, scores: Object }} record
 * @returns {{ [category: string]: number }}
 */
export function getCategoryStats(record) {
  const map = {}
  for (const q of record.questions || []) {
    const s = record.scores[q.id]
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
}

/**
 * 获取单条记录的薄弱分类（得分 < 5）
 * @returns {Array<{ knowledgePoint: string, score: number }>}
 */
export function getRecordWeakPoints(record) {
  const catStats = getCategoryStats(record)
  return Object.entries(catStats)
    .filter(([, s]) => s < 5)
    .map(([cat, s]) => ({ knowledgePoint: cat, score: s }))
    .sort((a, b) => a.score - b.score)
}
