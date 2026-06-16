import { apiRequest } from './apiClient'

const BASE = '/api/knowledge'

/** 列出所有知识库 */
export async function fetchKnowledgeBases() {
  return apiRequest(BASE)
}

/** 创建知识库 */
export async function createKnowledgeBase({ name, description = '' }) {
  return apiRequest(BASE, { method: 'POST', body: { name, description } })
}

/** 删除知识库 */
export async function deleteKnowledgeBase(id) {
  return apiRequest(`${BASE}/${id}`, { method: 'DELETE' })
}

/** 获取知识库详情（含文件列表） */
export async function fetchKnowledgeBase(id) {
  return apiRequest(`${BASE}/${id}`)
}

/** 上传文件到知识库（发送已解析的文本） */
export async function uploadFileToKB(kbId, { name, type, content }) {
  return apiRequest(`${BASE}/${kbId}/files`, {
    method: 'POST',
    body: { name, type, content },
  })
}

/** 删除知识库中的文件 */
export async function deleteFileFromKB(kbId, fileId) {
  return apiRequest(`${BASE}/${kbId}/files/${fileId}`, { method: 'DELETE' })
}

/** 基于知识库内容生成面试题 */
export async function generateFromKB(kbId, { questionCount, difficulty, model }) {
  return apiRequest(`${BASE}/${kbId}/generate`, {
    method: 'POST',
    body: { questionCount, difficulty, model },
  })
}
