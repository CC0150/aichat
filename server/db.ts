import type DatabaseType from 'better-sqlite3'
import Database from 'better-sqlite3'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// 本文件位于 server/db.ts，数据目录应为 server/data（docker 挂载卷 + .gitignore）
const DATA_DIR = path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const db: DatabaseType.Database = new Database(path.join(DATA_DIR, 'app.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`)

export interface DBUser {
  id: number
  username: string
  password_hash: string
  created_at: string
}

export interface PublicUser {
  id: number
  username: string
  createdAt: string
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function toPublicUser(u: DBUser): PublicUser {
  return { id: u.id, username: u.username, createdAt: u.created_at }
}

/** 创建用户；用户名冲突时返回 null */
export function createUser(username: string, passwordHash: string): DBUser | null {
  try {
    const info = db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, passwordHash, new Date().toISOString())
    return findUserById(Number(info.lastInsertRowid)) ?? null
  } catch {
    return null
  }
}

export function findUserByUsername(username: string): DBUser | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DBUser | undefined
}

export function findUserById(id: number): DBUser | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DBUser | undefined
}

export function createSession(userId: number): { id: string; expiresAt: number } {
  const id = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    expiresAt,
    Date.now(),
  )
  return { id, expiresAt }
}

export function findSessionWithUser(
  sessionId: string,
): { id: string; user_id: number; expires_at: number; username: string } | undefined {
  return db
    .prepare(
      `SELECT s.id, s.user_id, s.expires_at, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as
    | { id: string; user_id: number; expires_at: number; username: string }
    | undefined
}

export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

export function cleanupExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
}

// 每小时清理一次过期会话，unref 以免阻塞进程退出
setInterval(
  () => {
    try {
      cleanupExpiredSessions()
    } catch {
      /* ignore */
    }
  },
  60 * 60 * 1000,
).unref()
