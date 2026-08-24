import { apiRequest } from './apiClient'

export interface ServerChatMeta {
  id: string
  title: string
  updatedAt: string
}

/** 当前用户的会话列表（仅元信息） */
export async function listChats(): Promise<ServerChatMeta[]> {
  const data = await apiRequest('/api/chat')
  return data.chats ?? []
}

/** 单个会话及其消息 */
export async function getChat(id: string): Promise<{ chat: ServerChatMeta; messages: unknown[] }> {
  return apiRequest(`/api/chat/${encodeURIComponent(id)}`)
}

/** 幂等创建/更新会话（标题 + 可选全量消息） */
export async function upsertChat(
  id: string,
  body: { title?: string; updatedAt?: number; messages?: unknown[] },
): Promise<void> {
  await apiRequest(`/api/chat/${encodeURIComponent(id)}`, { method: 'PUT', body })
}

/** 删除会话及其消息 */
export async function deleteChat(id: string): Promise<void> {
  await apiRequest(`/api/chat/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
