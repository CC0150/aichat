import { apiRequest } from './apiClient'

export interface ParsedRemoteFile {
  name: string
  size: number
  type: string
  text: string
}

/** 把原始文件批量交给后端解析，返回提取文本（前端不再本地解析） */
export async function parseFiles(files: File[]): Promise<ParsedRemoteFile[]> {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  const data = await apiRequest('/api/parse', { method: 'POST', body: form })
  return data.files ?? []
}
