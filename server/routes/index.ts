import type { Express } from 'express'
import chatRouter from './chat'
import interviewRouter from './interview'
import questionsRouter from './questions'
import knowledgeRouter from './knowledge'
import ragRouter from './rag'
import healthRouter from './health'

/**
 * 注册所有路由
 */
export function setupRoutes(app: Express): void {
  app.use('/api/chat', chatRouter)
  app.use('/api/interview', interviewRouter)
  app.use('/api/questions', questionsRouter)
  app.use('/api/knowledge', knowledgeRouter)
  app.use('/api/rag', ragRouter)
  app.use('/health', healthRouter)
}
