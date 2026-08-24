import type { Express } from 'express'
import authRouter from './auth'
import chatRouter from './chat'
import interviewRouter from './interview'
import questionsRouter from './questions'
import knowledgeRouter from './knowledge'
import ragRouter from './rag'
import parseRouter from './parse'
import healthRouter from './health'
import { requireAuth } from '../middleware/auth'

/**
 * 注册所有路由
 * 顺序关键：`/api/auth` 先挂载（公开），随后 `/api` 全量挂鉴权守卫，
 * 之后的业务路由都需登录；`/health` 保持公开。
 */
export function setupRoutes(app: Express): void {
  app.use('/api/auth', authRouter)
  app.use('/api', requireAuth)
  app.use('/api/chat', chatRouter)
  app.use('/api/interview', interviewRouter)
  app.use('/api/questions', questionsRouter)
  app.use('/api/knowledge', knowledgeRouter)
  app.use('/api/rag', ragRouter)
  app.use('/api/parse', parseRouter)
  app.use('/health', healthRouter)
}
