/**
 * 面试记录导出工具
 * 支持 Markdown (.md)、纯文本 (.txt)、JSON (.json) 三种格式
 */

function formatDate(isoString) {
  if (!isoString) return '未知'
  return new Date(isoString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatScore(score) {
  if (score == null || score === '') return '-'
  return `${score}/10`
}

function getScoreLabel(score) {
  if (score >= 8) return '优秀'
  if (score >= 5) return '良好'
  return '需提升'
}

// ---- Markdown 格式 ----

function formatRecordMarkdown(record) {
  const lines = []
  const label = record.typeLabel || '面试记录'
  const source = record.customSource ? ` (${record.customSource})` : ''

  lines.push(`# ${label}${source}`)
  lines.push('')
  lines.push(`- **日期**: ${formatDate(record.finishedAt)}`)
  lines.push(`- **总分**: ${formatScore(record.totalScore)}（${getScoreLabel(record.totalScore)}）`)
  lines.push(`- **题目数**: ${(record.questions || []).length} 题`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (let i = 0; i < (record.questions || []).length; i++) {
    const q = record.questions[i]
    const s = (record.scores || {})[q.id] || {}
    const a = (record.answers || {})[q.id] || ''
    const conv = (record.conversations || {})[q.id] || []

    lines.push(`## Q${i + 1}: ${q.question}（得分: ${formatScore(s.score)}）`)
    lines.push('')

    if (q.difficulty) {
      const diffMap = { easy: '简单', medium: '中等', hard: '困难' }
      lines.push(`- **难度**: ${diffMap[q.difficulty] || q.difficulty}`)
    }
    if (q.category) {
      lines.push(`- **分类**: ${q.category}`)
    }
    if ((q.tags || []).length) {
      lines.push(`- **标签**: ${q.tags.join('、')}`)
    }

    // 对话记录（深度评估模式）
    if (conv.length > 0) {
      lines.push('')
      lines.push('### 对话记录')
      lines.push('')
      for (let mi = 0; mi < conv.length; mi++) {
        const msg = conv[mi]
        const roleLabel = msg.role === 'user' ? '我' : `AI 追问（第${Math.ceil((mi + 1) / 2)}轮）`
        lines.push(`**${roleLabel}**: ${msg.content}`)
        lines.push('')
      }
    } else if (a) {
      // 普通模式回答
      lines.push('')
      lines.push('### 我的回答')
      lines.push('')
      lines.push(a)
      lines.push('')
    }

    // 评分详情
    if (s.score != null) {
      lines.push('### 评分详情')
      lines.push('')
      lines.push(`| 维度 | 得分 |`)
      lines.push(`|------|------|`)
      if (s.correctness != null) lines.push(`| 正确性 | ${s.correctness}/10 |`)
      if (s.completeness != null) lines.push(`| 完整性 | ${s.completeness}/10 |`)
      if (s.clarity != null) lines.push(`| 清晰度 | ${s.clarity}/10 |`)
      lines.push('')
    }

    if (s.feedback) {
      lines.push('### AI 点评')
      lines.push('')
      lines.push(`> ${s.feedback}`)
      lines.push('')
    }

    if (s.improvedAnswer) {
      lines.push('### 参考回答')
      lines.push('')
      lines.push(s.improvedAnswer)
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

// ---- 纯文本格式 ----

function formatRecordText(record) {
  const lines = []
  const label = record.typeLabel || '面试记录'
  const source = record.customSource ? ` (${record.customSource})` : ''

  lines.push(`===== ${label}${source} =====`)
  lines.push('')
  lines.push(`日期: ${formatDate(record.finishedAt)}`)
  lines.push(`总分: ${formatScore(record.totalScore)}（${getScoreLabel(record.totalScore)}）`)
  lines.push(`题目数: ${(record.questions || []).length} 题`)
  lines.push('')
  lines.push('----------------------------------------')
  lines.push('')

  for (let i = 0; i < (record.questions || []).length; i++) {
    const q = record.questions[i]
    const s = (record.scores || {})[q.id] || {}
    const a = (record.answers || {})[q.id] || ''
    const conv = (record.conversations || {})[q.id] || []

    lines.push(`Q${i + 1}: ${q.question}（得分: ${formatScore(s.score)}）`)
    lines.push('')

    if (q.difficulty) {
      const diffMap = { easy: '简单', medium: '中等', hard: '困难' }
      lines.push(`  难度: ${diffMap[q.difficulty] || q.difficulty}`)
    }
    if (q.category) {
      lines.push(`  分类: ${q.category}`)
    }

    if (conv.length > 0) {
      lines.push('')
      lines.push('  --- 对话记录 ---')
      for (let mi = 0; mi < conv.length; mi++) {
        const msg = conv[mi]
        const roleLabel = msg.role === 'user' ? '我' : `AI追问(第${Math.ceil((mi + 1) / 2)}轮)`
        lines.push(`  [${roleLabel}] ${msg.content}`)
      }
    } else if (a) {
      lines.push('')
      lines.push('  --- 我的回答 ---')
      lines.push(`  ${a}`)
    }

    if (s.score != null) {
      lines.push('')
      lines.push('  --- 评分详情 ---')
      if (s.correctness != null) lines.push(`  正确性: ${s.correctness}/10`)
      if (s.completeness != null) lines.push(`  完整性: ${s.completeness}/10`)
      if (s.clarity != null) lines.push(`  清晰度: ${s.clarity}/10`)
    }

    if (s.feedback) {
      lines.push('')
      lines.push(`  --- AI点评 ---`)
      lines.push(`  ${s.feedback}`)
    }

    if (s.improvedAnswer) {
      lines.push('')
      lines.push(`  --- 参考回答 ---`)
      lines.push(`  ${s.improvedAnswer}`)
    }

    lines.push('')
    lines.push('----------------------------------------')
    lines.push('')
  }

  return lines.join('\n')
}

// ---- JSON 格式 ----

function formatRecordJson(record) {
  return {
    type: record.typeLabel || '面试',
    date: record.finishedAt,
    totalScore: record.totalScore,
    questionCount: (record.questions || []).length,
    details: (record.questions || []).map((q) => {
      const s = (record.scores || {})[q.id] || {}
      const a = (record.answers || {})[q.id] || ''
      const conv = (record.conversations || {})[q.id] || []
      return {
        question: q.question,
        difficulty: q.difficulty,
        category: q.category,
        score: s.score ?? null,
        correctness: s.correctness ?? null,
        completeness: s.completeness ?? null,
        clarity: s.clarity ?? null,
        feedback: s.feedback || '',
        improvedAnswer: s.improvedAnswer || '',
        answer: a || null,
        conversation: conv.length ? conv : null,
      }
    }),
  }
}

// ---- 下载工具 ----

function exportBlob(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 导出面试记录
 * @param {Array} records - 面试记录数组
 * @param {'md'|'txt'|'json'} format - 导出格式
 */
function exportRecords(records, format = 'md') {
  if (!records || records.length === 0) return

  const dateStr = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    const data = records.map(formatRecordJson)
    const json = JSON.stringify(records.length === 1 ? data[0] : data, null, 2)
    exportBlob(json, `interview-export-${dateStr}.json`)
    return
  }

  const formatter = format === 'md' ? formatRecordMarkdown : formatRecordText
  const ext = format === 'md' ? 'md' : 'txt'
  const content = records.map((r) => formatter(r)).join('\n\n')
  exportBlob(content, `interview-export-${dateStr}.${ext}`)
}

export { formatRecordMarkdown, formatRecordText, formatRecordJson, exportBlob, exportRecords }
