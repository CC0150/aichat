import { apiRequest } from './apiClient'

const BASE = '/api/knowledge'

/** 列出所有知识库 @returns {Promise<Array>} */
export async function fetchKnowledgeBases() {
  return apiRequest(BASE)
}

/** 创建知识库 @param {{ name: string, description?: string }} @returns {Promise<Object>} */
export async function createKnowledgeBase({ name, description = '' }) {
  return apiRequest(BASE, { method: 'POST', body: { name, description } })
}

/** 删除知识库 @param {string} id @returns {Promise<Object>} */
export async function deleteKnowledgeBase(id) {
  return apiRequest(`${BASE}/${id}`, { method: 'DELETE' })
}

/** 获取知识库详情（含文件列表） @param {string} id @returns {Promise<Object>} */
export async function fetchKnowledgeBase(id) {
  return apiRequest(`${BASE}/${id}`)
}

/** 上传已解析文本到知识库 @param {string} kbId @param {{ name: string, type: string, content: string }} @returns {Promise<Object>} */
export async function uploadFileToKB(kbId, { name, type, content }) {
  return apiRequest(`${BASE}/${kbId}/files`, { method: 'POST', body: { name, type, content } })
}

/** 删除知识库中的文件 @param {string} kbId @param {string} fileId @returns {Promise<Object>} */
export async function deleteFileFromKB(kbId, fileId) {
  return apiRequest(`${BASE}/${kbId}/files/${fileId}`, { method: 'DELETE' })
}

/** 基于知识库内容生成面试题 @param {string} kbId @param {{ questionCount: number, difficulty: string, model?: string }} @returns {Promise<{ questions: Array, error?: string }>} */
export async function generateFromKB(kbId, { questionCount, difficulty, model }) {
  return apiRequest(`${BASE}/${kbId}/generate`, {
    method: 'POST',
    body: { questionCount, difficulty, model },
  })
}

/** Agent 驱动出题（先搜索知识库了解内容范围，再有针对性地出题） @param {string} kbId @param {{ questionCount: number, difficulty: string, model?: string }} @returns {Promise<{ questions: Array, error?: string }>} */
export async function agentGenerateFromKB(kbId, { questionCount, difficulty, model }) {
  return apiRequest(`${BASE}/${kbId}/agent-generate`, {
    method: 'POST',
    body: { questionCount, difficulty, model },
  })
}

/** 更新知识库名称与描述 @param {string} id @param {{ name: string, description?: string }} @returns {Promise<Object>} */
export async function updateKnowledgeBase(id, { name, description }) {
  return apiRequest(`${BASE}/${id}`, { method: 'PATCH', body: { name, description } })
}

/** 重新索引知识库（重新切块 + embedding + 入库） @param {string} kbId @returns {Promise<{ files: number, chunks: number }>} */
export async function reindexKB(kbId) {
  return apiRequest(`${BASE}/${kbId}/reindex`, { method: 'POST' })
}
