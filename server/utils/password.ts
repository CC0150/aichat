import crypto from 'crypto'

const KEY_LEN = 64
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/** 使用 scrypt 加盐哈希密码，返回 "salt:hash" 格式 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS).toString('hex')
  return `${salt}:${hash}`
}

/** 常量时间比较验证密码 */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  let candidate: Buffer
  try {
    candidate = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_OPTS)
  } catch {
    return false
  }
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}
