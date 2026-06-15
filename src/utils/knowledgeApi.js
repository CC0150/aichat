const BASE = "/api/knowledge"

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `请求失败：${response.status}`)
  }
  return response.json()
}

/** 列出所有知识库 */
export async function fetchKnowledgeBases() {
  return request(BASE)
}

/** 创建知识库 */
export async function createKnowledgeBase({ name, description = "" }) {
  return request(BASE, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  })
}

/** 删除知识库 */
export async function deleteKnowledgeBase(id) {
  return request(`${BASE}/${id}`, { method: "DELETE" })
}

/** 获取知识库详情（含文件列表） */
export async function fetchKnowledgeBase(id) {
  return request(`${BASE}/${id}`)
}

/** 上传文件到知识库（发送已解析的文本） */
export async function uploadFileToKB(kbId, { name, type, content }) {
  return request(`${BASE}/${kbId}/files`, {
    method: "POST",
    body: JSON.stringify({ name, type, content }),
  })
}

/** 删除知识库中的文件 */
export async function deleteFileFromKB(kbId, fileId) {
  return request(`${BASE}/${kbId}/files/${fileId}`, { method: "DELETE" })
}

/** 基于知识库内容生成面试题 */
export async function generateFromKB(kbId, { questionCount, difficulty, model }) {
  return request(`${BASE}/${kbId}/generate`, {
    method: "POST",
    body: JSON.stringify({ questionCount, difficulty, model }),
  })
}
