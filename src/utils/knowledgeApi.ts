import { apiRequest } from './apiClient'

/** 获取所有知识库 */
export function fetchKnowledgeBases(): Promise<any[]> {
  return apiRequest('/api/knowledge')
}

/** 创建知识库 */
export function createKnowledgeBase(body: { name: string; description?: string }): Promise<any> {
  return apiRequest('/api/knowledge', { method: 'POST', body })
}

/** 删除知识库 */
export function deleteKnowledgeBase(id: string): Promise<any> {
  return apiRequest(`/api/knowledge/${id}`, { method: 'DELETE' })
}

/** 更新知识库 */
export function updateKnowledgeBase(
  id: string,
  body: { name: string; description?: string },
): Promise<any> {
  return apiRequest(`/api/knowledge/${id}`, { method: 'PATCH', body })
}

/** 获取知识库详情 */
export function fetchKnowledgeBase(id: string): Promise<any> {
  return apiRequest(`/api/knowledge/${id}`)
}

/** 上传原始文件到知识库（服务端解析） */
export function uploadFileToKB(id: string, file: File): Promise<any> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest(`/api/knowledge/${id}/files`, { method: 'POST', body: form })
}

/** 从知识库删除文件 */
export function deleteFileFromKB(kbId: string, fileId: string): Promise<any> {
  return apiRequest(`/api/knowledge/${kbId}/files/${fileId}`, { method: 'DELETE' })
}

/** 基于知识库生成面试题 */
export function generateFromKB(
  id: string,
  body: {
    questionCount?: number
    difficulty?: string
    model?: string
    baseUrl?: string
    apiKey?: string
  },
): Promise<any> {
  return apiRequest(`/api/knowledge/${id}/generate`, { method: 'POST', body })
}

/** Agent 驱动知识库出题 */
export function agentGenerateFromKB(
  id: string,
  body: {
    questionCount?: number
    difficulty?: string
    model?: string
    baseUrl?: string
    apiKey?: string
  },
): Promise<any> {
  return apiRequest(`/api/knowledge/${id}/agent-generate`, { method: 'POST', body })
}

/** 重新索引知识库 */
export function reindexKB(id: string): Promise<any> {
  return apiRequest(`/api/knowledge/${id}/reindex`, { method: 'POST' })
}
