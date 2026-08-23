import type { NextFunction, Request, Response } from 'express'
import { findSessionWithUser } from '../db'

// Express 的 Request 类型扩展需通过 declare namespace 做全局声明合并
declare global {
  namespace Express {
    interface Request {
      userId?: number
      username?: string
    }
  }
}

/**
 * 登录校验中间件：读取 httpOnly cookie 中的 sessionId，
 * 查到未过期的会话后把 userId/username 挂到请求上，否则 401。
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionId = (req.cookies as Record<string, string> | undefined)?.sessionId
  if (!sessionId) {
    res.status(401).json({ error: '未登录' })
    return
  }

  const session = findSessionWithUser(sessionId)
  if (!session || session.expires_at <= Date.now()) {
    res.status(401).json({ error: '登录已过期，请重新登录' })
    return
  }

  req.userId = session.user_id
  req.username = session.username
  next()
}
