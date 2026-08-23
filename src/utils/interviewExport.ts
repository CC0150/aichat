import type { InterviewRecord } from '@/types'

function formatRecordsAsMarkdown(records: InterviewRecord[]): string {
  return records
    .map((r) => {
      const s = r.score
      const scoreLine = s
        ? `**得分**: ${s.score}/10 | 正确性: ${s.correctness} | 完整性: ${s.completeness} | 清晰度: ${s.clarity}`
        : '**得分**: 未评分'
      return `## ${r.question.question}\n\n**考生回答**: ${r.userAnswer}\n\n${scoreLine}\n\n**AI 反馈**: ${s?.feedback || '无'}\n\n**参考答案**: ${s?.improvedAnswer || '无'}`
    })
    .join('\n\n---\n\n')
}

function formatRecordsAsText(records: InterviewRecord[]): string {
  return records
    .map((r) => {
      const s = r.score
      const scoreLine = s ? `得分: ${s.score}/10` : '得分: 未评分'
      return `【题目】${r.question.question}\n【回答】${r.userAnswer}\n【${scoreLine}】\n【反馈】${s?.feedback || '无'}`
    })
    .join('\n\n---\n\n')
}

function formatRecordsAsJSON(records: InterviewRecord[]): string {
  return JSON.stringify(records, null, 2)
}

export function exportRecords(records: InterviewRecord[], format: 'md' | 'txt' | 'json'): void {
  let content: string
  let mimeType: string
  let extension: string

  switch (format) {
    case 'md':
      content = formatRecordsAsMarkdown(records)
      mimeType = 'text/markdown'
      extension = 'md'
      break
    case 'txt':
      content = formatRecordsAsText(records)
      mimeType = 'text/plain'
      extension = 'txt'
      break
    case 'json':
      content = formatRecordsAsJSON(records)
      mimeType = 'application/json'
      extension = 'json'
      break
    default:
      content = formatRecordsAsText(records)
      mimeType = 'text/plain'
      extension = 'txt'
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `interview-${Date.now()}.${extension}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
