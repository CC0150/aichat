import type OpenAI from 'openai'

// ===== 共享类型定义 =====

/** AI 对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
  reasoning_content?: string
  name?: string
}

/** OpenAI 工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** OpenAI 工具定义 (JSON Schema) */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

/** agentLoop 配置 */
export interface AgentLoopOptions {
  tools: ToolDefinition[]
  executeTool: (
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<string>
  model: string
  system: string
  messages: ChatMessage[]
  maxSteps?: number
  logTag?: string
  /** 客户端断开时中止上游 LLM 调用 */
  signal?: AbortSignal
  /** 自定义供应商客户端（BYOK），缺省回落到平台 openai */
  client?: OpenAI
}

/** agentLoop 返回 */
export interface AgentLoopResult {
  text: string
  steps: Array<{ toolName: string; args: Record<string, unknown> }>
}

/** 知识库文件元数据 */
export interface KBFileMeta {
  id: string
  name: string
  size: number
  uploadedAt: string
}

/** 知识库元数据 */
export interface KBMeta {
  id: string
  name: string
  description?: string
  ownerId?: number
  createdAt: string
  updatedAt: string
  files: KBFileMeta[]
}

/** 向量块 */
export interface VectorChunk {
  vector: number[]
  text: string
  id: string
  kbId: string
  fileId: string
  userId: number
}

/** 向量搜索结果 */
export interface SearchResult {
  text: string
  id: string
  kbId: string
  fileId: string
  _distance: number
}

/** 面试评估结果 */
export interface InterviewScore {
  score: number
  correctness: number
  completeness: number
  clarity: number
  feedback: string
  improvedAnswer: string
}

/** Agent 评估 Action */
export interface FollowUpAction {
  action: 'follow_up'
  followUpQuestion: string
  scoreHint: number
  agentSteps: AgentLoopResult['steps']
}

export interface CompleteAction {
  action: 'complete'
  score: number
  correctness: number
  completeness: number
  clarity: number
  feedback: string
  improvedAnswer: string
  agentSteps: AgentLoopResult['steps']
}

export type AgentEvaluateResult = FollowUpAction | CompleteAction

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

/** callAI 参数 */
export interface CallAIParams {
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
  logTag?: string
  signal?: AbortSignal
  /** 自定义供应商客户端（BYOK），缺省回落到平台 openai */
  client?: OpenAI
}

/** sanitizeString 参数 */
export interface SanitizeOptions {
  maxLength?: number
  required?: boolean
}

/** chunkText 参数 */
export interface ChunkOptions {
  chunkSize?: number
  overlap?: number
}

/** chunkSemantic 参数 */
export interface SemanticChunkOptions extends ChunkOptions {
  /** 语义断点阈值 (0-1)，相邻句子余弦相似度低于此值则切分，默认 0.7 */
  similarityThreshold?: number
  /** 最短句子长度（字符），短于此值的句子总是合并到前一句，避免独立成句的碎片被误判为断点，默认 5 */
  minSentenceLength?: number
}

/** 向量搜索参数 */
export interface SearchOptions {
  userId?: number
  kbId?: string
  fileId?: string
  limit?: number
}

/** RAG 查询参数 */
export interface RagQueryOptions {
  userId?: number
  kbId?: string
  model?: string
  topK?: number
  rerank?: boolean
  /** 自定义供应商客户端（BYOK），缺省回落到平台 openai */
  client?: OpenAI
}

/** errorHandler 参数 */
export interface ErrorHandlerOptions {
  fallbackMessage?: string
  extras?: Record<string, unknown>
}
