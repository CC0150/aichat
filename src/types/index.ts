// ===== 前端共享类型 =====

/** 模型配置 */
export interface ModelOption {
  id: string
  label: string
  shortLabel: string
  model: string
  contextWindow: number
  supportsVision: boolean
}

/** 聊天消息 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | ChatMessageContent[]
}

export interface ChatMessageContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

/** 会话 */
export interface ChatHistoryItem {
  id: string
  title: string
  updatedAt: string
}

/** 附件 */
export interface Attachment {
  id: string
  name: string
  text: string
  type: 'pdf' | 'word' | 'text'
}

/** 图片 */
export interface ImageFile {
  id: string
  name: string
  url: string
  file: File
}

/** Undo 状态 */
export interface UndoState {
  chatId: string
  items: ChatMessage[]
  insertIndex: number
  timer: ReturnType<typeof setTimeout>
}

/** SSE 流请求选项 */
export interface SSEStreamOptions {
  onChunk: (chunk: string) => void
  onError?: (msg: string) => void
  signal?: AbortSignal
}

/** 面试题 */
export interface InterviewQuestion {
  id: string
  type: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  knowledgePoints: string[]
  question: string
  answerPoints: string[]
}

/** 面试评分 */
export interface InterviewScore {
  score: number
  correctness: number
  completeness: number
  clarity: number
  feedback: string
  improvedAnswer: string
}

/** 面试记录 */
export interface InterviewRecord {
  id: string
  question: InterviewQuestion
  userAnswer: string
  conversationHistory?: Array<{ role: string; content: string }>
  score?: InterviewScore
  createdAt: string
}

/** 答题状态 */
export type AnswerStatus = 'idle' | 'answering' | 'scoring' | 'feedback' | 'finished'

/** 难度 */
export type Difficulty = 'all' | 'easy' | 'medium' | 'hard'

/** 知识库摘要 */
export interface KnowledgeBaseSummary {
  id: string
  name: string
  description: string
  fileCount: number
  createdAt: string
}

/** 知识库文件 */
export interface KBFile {
  id: string
  name: string
  type: string
  charCount: number
  uploadedAt: string
}

/** 知识库详情 */
export interface KnowledgeBase {
  id: string
  name: string
  description: string
  createdAt: string
  files: KBFile[]
}

/** 分类统计 */
export interface CategoryStats {
  category: string
  count: number
  avgScore: number
}
