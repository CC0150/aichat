import path from 'path'
import express, { type NextFunction, type Request, type Response } from 'express'

import { PORT, API_KEY } from './config'
import { setupMiddleware, setupErrorHandler } from './middleware'
import { setupRoutes } from './routes'
import { claimLegacyKBs, getKBOwnerMap } from './routes/knowledge'
import { migrateVectorsIfLegacy } from './services/vectorStore'

if (!API_KEY) {
  console.warn(
    '[server] 未检测到 DEEPSEEK_API_KEY，请在 server/.env 中配置：DEEPSEEK_API_KEY=sk-xxx',
  )
}

const app = express()

// 中间件
setupMiddleware(app)

// 路由
setupRoutes(app)

// 生产环境：托管前端构建产物（Vue SPA fallback）
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // 不拦截 API / SSE 路径
    if (req.path.startsWith('/api') || req.path === '/health') return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// 全局错误处理（必须在路由之后注册）
setupErrorHandler(app)

/** 启动数据迁移（幂等）：存量 KB 认领 + 向量表补 userId，失败不阻塞启动 */
async function runMigrations(): Promise<void> {
  try {
    await claimLegacyKBs()
    const ownerMap = await getKBOwnerMap()
    await migrateVectorsIfLegacy(ownerMap)
  } catch (err) {
    console.error('[server] 数据迁移失败（跳过）：', (err as Error).message)
  }
}

runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] Chat proxy listening on http://localhost:${PORT}`)
  })
})
