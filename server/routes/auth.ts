import { Router, type Response } from 'express'
import {
  createSession,
  createUser,
  deleteSession,
  findUserByUsername,
  toPublicUser,
  cleanupExpiredSessions,
} from '../db'
import { hashPassword, verifyPassword } from '../utils/password'
import { sanitizeString } from '../utils/validate'
import { requireAuth } from '../middleware/auth'

const router = Router()

const USERNAME_RE = /^[A-Za-z0-9_一-龥]{3,24}$/
const SESSION_COOKIE = 'sessionId'
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000

function setSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  })
}

/** POST /api/auth/register —— 注册并自动登录 */
router.post('/register', (req, res) => {
  const username = sanitizeString(req.body?.username, { maxLength: 24 })
  const password = sanitizeString(req.body?.password, { maxLength: 100 })

  if (!username || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: '用户名需为 3-24 位字母、数字、下划线或中文' })
    return
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' })
    return
  }

  const user = createUser(username, hashPassword(password))
  if (!user) {
    res.status(409).json({ error: '用户名已存在' })
    return
  }

  const session = createSession(user.id)
  setSessionCookie(res, session.id)
  res.status(201).json({ user: toPublicUser(user) })
})

/** POST /api/auth/login —— 登录 */
router.post('/login', (req, res) => {
  const username = sanitizeString(req.body?.username, { maxLength: 24 })
  const password = sanitizeString(req.body?.password, { maxLength: 100 })

  if (!username || !password) {
    res.status(400).json({ error: '请输入用户名和密码' })
    return
  }

  const user = findUserByUsername(username)
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' })
    return
  }

  cleanupExpiredSessions()
  const session = createSession(user.id)
  setSessionCookie(res, session.id)
  res.json({ user: toPublicUser(user) })
})

/** GET /api/auth/me —— 获取当前登录用户 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.userId, username: req.username } })
})

/** POST /api/auth/logout —— 登出，删除会话并清空 cookie */
router.post('/logout', requireAuth, (req, res) => {
  const sessionId = (req.cookies as Record<string, string> | undefined)?.sessionId
  if (sessionId) deleteSession(sessionId)
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' })
  res.json({ success: true })
})

export default router
