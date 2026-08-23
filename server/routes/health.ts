import { Router, type Request, type Response } from 'express'

const router = Router()

/**
 * GET /health
 * 健康检查
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

export default router
