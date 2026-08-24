/**
 * LanceDB 向量存储
 *
 * 提供 chunk 向量的存取和检索，数据存储在 server/data/vectors/ 目录。
 * API: connect → createEmptyTable/openTable → add/search → delete
 */

import * as lancedb from '@lancedb/lancedb'
import * as arrow from 'apache-arrow'
import path from 'path'
import type { VectorChunk, SearchResult, SearchOptions } from '../types'

const DB_PATH = path.join(__dirname, '..', 'data', 'vectors')

// 单例缓存
let db: Awaited<ReturnType<typeof lancedb.connect>> | null = null
let table: any = null

const TABLE_NAME = 'chunks'

/**
 * 向量维度（必须跟 embedding 模型输出一致）
 * BAAI/bge-large-zh-v1.5 → 1024 维
 */
const VECTOR_DIM = 1024

// ===== 内部 =====

/**
 * 获取或创建 LanceDB 数据库实例（单例缓存）
 */
async function getDB() {
  if (!db) db = await lancedb.connect(DB_PATH)
  return db
}

/**
 * Arrow Schema 定义 — 显式指定每列的名称和类型
 * 比「塞一条占位数据 → 推断 schema → 删占位行」更可控
 */
function getSchema(): arrow.Schema {
  return new arrow.Schema([
    new arrow.Field('userId', new arrow.Int32()),
    new arrow.Field(
      'vector',
      new arrow.FixedSizeList(VECTOR_DIM, new arrow.Field('item', new arrow.Float32())),
    ),
    new arrow.Field('text', new arrow.Utf8()),
    new arrow.Field('id', new arrow.Utf8()),
    new arrow.Field('kbId', new arrow.Utf8()),
    new arrow.Field('fileId', new arrow.Utf8()),
  ])
}

// ===== 公开 API =====

/**
 * 初始化或获取 chunks 表
 * 首次调用时用 Arrow schema 创建空表，后续直接打开
 */
export async function getTable() {
  if (table) return table

  const database = await getDB()
  const names = await database.tableNames()

  if (!names.includes(TABLE_NAME)) {
    table = await database.createEmptyTable(TABLE_NAME, getSchema())
  } else {
    table = await database.openTable(TABLE_NAME)
  }

  return table
}

/**
 * 批量存入向量
 */
export async function addChunks(rows: VectorChunk[]): Promise<void> {
  if (!rows || rows.length === 0) return

  const t = await getTable()
  await t.add(rows)
}

/**
 * 检索最相似的 topK 个块
 */
export async function search(
  queryVector: number[],
  { userId, kbId, fileId, limit = 5 }: SearchOptions = {},
): Promise<SearchResult[]> {
  const t = await getTable()

  let query = t.search(queryVector).limit(limit)

  // userId 为服务端数值，直接拼接安全
  if (userId != null) query = query.where(`userId = ${userId}`)
  // kbId / fileId 由服务端生成（UUID），不存在注入风险
  if (kbId) query = query.where(`kbId = "${kbId}"`)
  if (fileId) query = query.where(`fileId = "${fileId}"`)

  return query.toArray()
}

/**
 * 删除指定知识库的所有向量（限定归属用户，防止越权）
 */
export async function deleteByKB(kbId: string, userId?: number): Promise<void> {
  const t = await getTable()
  const where = userId != null ? `userId = ${userId} AND kbId = "${kbId}"` : `kbId = "${kbId}"`
  await t.delete(where)
}

/**
 * 删除指定文件的所有向量（限定归属用户，防止越权）
 */
export async function deleteByFile(fileId: string, userId?: number): Promise<void> {
  const t = await getTable()
  const where =
    userId != null ? `userId = ${userId} AND fileId = "${fileId}"` : `fileId = "${fileId}"`
  await t.delete(where)
}

/**
 * 一次性迁移：旧版 chunks 表缺少 userId 列时，读全量行 → 按 kbId→owner 映射补 userId
 * → 重建表（新 schema）→ 重写行（复用原 vector，不重新 embedding）。幂等。
 * @param ownerMap kbId → 归属 userId
 */
export async function migrateVectorsIfLegacy(ownerMap: Record<string, number>): Promise<void> {
  const database = await getDB()
  const names = await database.tableNames()
  if (!names.includes(TABLE_NAME)) return
  // 尚无任何 KB 归属时不动表，避免把存量向量打成 userId=-1 孤儿
  if (Object.keys(ownerMap).length === 0) return

  const existing: any = await database.openTable(TABLE_NAME)
  const schema: any = await existing.schema()
  const fields: Array<{ name: string }> = schema?.fields ?? []
  if (fields.some((f) => f.name === 'userId')) return // 已是新版

  const rows: any[] = await existing.query().toArray()
  await (database as any).dropTable(TABLE_NAME)
  table = null // 清缓存，下个 getTable 重建

  const newTable: any = await getTable()
  if (rows.length > 0) {
    const tagged = rows.map((r: any) => ({ ...r, userId: ownerMap[r.kbId] ?? -1 }))
    await newTable.add(tagged)
  }
  console.log(`[vectors] 迁移完成：重建表并补齐 ${rows.length} 行 userId`)
}

/**
 * 获取 chunk 总数
 */
export async function count(): Promise<number> {
  const t = await getTable()
  return t.countRows()
}
