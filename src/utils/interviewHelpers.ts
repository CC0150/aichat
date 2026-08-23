import type { InterviewRecord, CategoryStats } from '@/types'
import type { InterviewQuestion, InterviewScore } from '@/types'

export const difficultyMap: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

export function getScoreColor(score: number): string {
  if (score >= 8) return 'text-emerald-500'
  if (score >= 5) return 'text-amber-500'
  return 'text-rose-500'
}

export function getScoreBg(score: number): string {
  if (score >= 8) return 'bg-emerald-500/10'
  if (score >= 5) return 'bg-amber-500/10'
  return 'bg-rose-500/10'
}

export function getScoreBgSolid(score: number): string {
  if (score >= 8) return 'bg-emerald-500'
  if (score >= 5) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function getScoreLabel(score: number): string {
  if (score >= 8.5) return '优秀'
  if (score >= 7) return '良好'
  if (score >= 5) return '一般'
  return '待提高'
}

export function getCategoryStats(records: InterviewRecord[]): CategoryStats[] {
  const map = new Map<string, { count: number; totalScore: number }>()
  for (const r of records) {
    if (!r.score) continue
    const cat = r.question.category || '未分类'
    const entry = map.get(cat) || { count: 0, totalScore: 0 }
    entry.count++
    entry.totalScore += r.score.score
    map.set(cat, entry)
  }
  return Array.from(map.entries()).map(([category, { count, totalScore }]) => ({
    category,
    count,
    avgScore: count > 0 ? Math.round((totalScore / count) * 10) / 10 : 0,
  }))
}

export function getRecordWeakPoints(record: InterviewRecord): string[] {
  if (!record.question?.knowledgePoints) return []
  if (!record.score || record.score.score >= 5) return []
  return record.question.knowledgePoints.slice(0, 3)
}

// ===== HistoryRecord 版本（一次面试含多道题） =====

/**
 * HistoryRecord 的形状（来自 interviewStore.history）
 * 一组面试包含多道题（questions 数组），每题有独立的分数（scores dict）
 */
interface HistoryRecord {
  id: string
  questions: InterviewQuestion[]
  scores: Record<string, InterviewScore>
  typeLabel?: string
  finishedAt?: string
  totalScore?: number
}

/** 按分类聚合多题面试记录的得分统计，返回 { 分类: 均分 } */
export function getHistoryCategoryStats(record: HistoryRecord): Record<string, number> {
  const map = new Map<string, { count: number; total: number }>()
  for (const q of record.questions) {
    const score = record.scores[q.id]
    if (!score) continue
    const cat = q.category || '未分类'
    const entry = map.get(cat) || { count: 0, total: 0 }
    entry.count++
    entry.total += score.score
    map.set(cat, entry)
  }
  const result: Record<string, number> = {}
  for (const [cat, { count, total }] of map) {
    result[cat] = count > 0 ? Math.round((total / count) * 10) / 10 : 0
  }
  return result
}

/** 从多题面试记录中提取薄弱知识点（得分 < 5 的知识点，最多 5 条） */
export function getHistoryWeakPoints(
  record: HistoryRecord,
): Array<{ knowledgePoint: string; score: number }> {
  const weak: Array<{ knowledgePoint: string; score: number }> = []
  for (const q of record.questions) {
    const score = record.scores[q.id]
    if (!score || score.score >= 5) continue
    for (const kp of q.knowledgePoints || []) {
      if (!weak.some((w) => w.knowledgePoint === kp)) {
        weak.push({ knowledgePoint: kp, score: score.score })
      }
    }
  }
  return weak.slice(0, 5)
}
