/**
 * LanceDB 向量存储
 *
 * 提供 chunk 向量的存取和检索，数据存储在 server/data/vectors/ 目录。
 * API: connect → createEmptyTable/openTable → add/search → delete
 */

const lancedb = require('@lancedb/lancedb')
const arrow = require('apache-arrow')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', 'data', 'vectors')

// 单例缓存
let db = null
let table = null

const TABLE_NAME = 'chunks'

/**
 * 向量维度（必须跟 embedding 模型输出一致）
 * BAAI/bge-large-zh-v1.5 → 1024 维
 */
const VECTOR_DIM = 1024

// ===== 内部 =====

async function getDB() {
  if (!db) db = await lancedb.connect(DB_PATH)
  return db
}

/**
 * Arrow Schema —— 显式定义每列的名称和类型
 * 比「塞一条占位数据 → 推断 schema → 删占位行」的标准很多
 */
function getSchema() {
  return new arrow.Schema([
    new arrow.Field('vector', new arrow.FixedSizeList(VECTOR_DIM, new arrow.Field('item', new arrow.Float32()))),
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
async function getTable() {
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
 * @param {Array<{ vector: number[], text: string, id: string, kbId: string, fileId: string }>} rows
 */
async function addChunks(rows) {
  if (!rows || rows.length === 0) return

  const t = await getTable()
  await t.add(rows)
}

/**
 * 检索最相似的 topK 个块
 * @param {number[]} queryVector - 查询向量（必须与入库时同维度）
 * @param {{ kbId?: string, fileId?: string, limit?: number }} opts
 * @returns {Promise<Array<{ text: string, id: string, kbId: string, fileId: string, _distance: number }>>}
 */
async function search(queryVector, { kbId, fileId, limit = 5 } = {}) {
  const t = await getTable()

  let query = t.search(queryVector).limit(limit)

  // kbId / fileId 由服务端生成（UUID），不存在注入风险
  if (kbId) query = query.where(`kbId = "${kbId}"`)
  if (fileId) query = query.where(`fileId = "${fileId}"`)

  return query.toArray()
}

/**
 * 删除指定知识库的所有向量
 */
async function deleteByKB(kbId) {
  const t = await getTable()
  await t.delete(`kbId = "${kbId}"`)
}

/**
 * 删除指定文件的所有向量
 */
async function deleteByFile(fileId) {
  const t = await getTable()
  await t.delete(`fileId = "${fileId}"`)
}

/**
 * 获取 chunk 总数
 */
async function count() {
  const t = await getTable()
  return t.countRows()
}

module.exports = { getTable, addChunks, search, deleteByKB, deleteByFile, count }
