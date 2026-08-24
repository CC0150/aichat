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

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    chat_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, chat_id)
  );

  CREATE TABLE IF NOT EXISTS interview_records (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
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

// ===== 聊天记录（按 user_id 隔离） =====

export interface ChatRow {
  id: string
  title: string
  updated_at: number
  created_at: number
}

export function upsertChat(
  userId: number,
  chat: { id: string; title: string; updatedAt: number; createdAt?: number },
): void {
  db.prepare(
    `INSERT INTO chats (id, user_id, title, updated_at, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`,
  ).run(chat.id, userId, chat.title, chat.updatedAt, chat.createdAt ?? Date.now())
}

export function listChats(userId: number): ChatRow[] {
  return db
    .prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as ChatRow[]
}

export function getChat(userId: number, id: string): ChatRow | undefined {
  return db.prepare('SELECT * FROM chats WHERE user_id = ? AND id = ?').get(userId, id) as
    | ChatRow
    | undefined
}

export function deleteChat(userId: number, id: string): void {
  db.prepare('DELETE FROM chat_messages WHERE user_id = ? AND chat_id = ?').run(userId, id)
  db.prepare('DELETE FROM chats WHERE user_id = ? AND id = ?').run(userId, id)
}

export function upsertMessages(
  userId: number,
  chatId: string,
  messages: unknown,
  updatedAt: number,
): void {
  db.prepare(
    `INSERT INTO chat_messages (chat_id, user_id, content_json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, chat_id) DO UPDATE
       SET content_json = excluded.content_json, updated_at = excluded.updated_at`,
  ).run(chatId, userId, JSON.stringify(messages ?? []), updatedAt)
}

export function getMessages(userId: number, chatId: string): unknown[] | null {
  const row = db
    .prepare('SELECT content_json FROM chat_messages WHERE user_id = ? AND chat_id = ?')
    .get(userId, chatId) as { content_json: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.content_json)
  } catch {
    return []
  }
}

// ===== 面试记录（按 user_id 隔离） =====

export function upsertRecord(
  userId: number,
  record: { id: string; data: unknown; updatedAt?: number; createdAt?: number },
): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO interview_records (id, user_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, id) DO UPDATE
       SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
  ).run(
    record.id,
    userId,
    JSON.stringify(record.data),
    record.createdAt ?? now,
    record.updatedAt ?? now,
  )
}

export function listRecords(userId: number): { id: string; data: unknown }[] {
  const rows = db
    .prepare(
      'SELECT id, data_json FROM interview_records WHERE user_id = ? ORDER BY updated_at DESC',
    )
    .all(userId) as { id: string; data_json: string }[]
  return rows.map((r) => ({ id: r.id, data: safeParseJson(r.data_json) }))
}

export function deleteRecord(userId: number, id: string): void {
  db.prepare('DELETE FROM interview_records WHERE user_id = ? AND id = ?').run(userId, id)
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
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
