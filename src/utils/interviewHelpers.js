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

export function getScoreBorder(score) {
  if (score >= 8) return 'border-emerald-500/20'
  if (score >= 5) return 'border-amber-500/20'
  return 'border-red-500/20'
}

export function getScoreLabel(score) {
  if (score >= 8) return '优秀'
  if (score >= 5) return '良好'
  return '需提升'
}
