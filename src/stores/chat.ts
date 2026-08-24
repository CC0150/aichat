import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage, ChatHistoryItem, UndoState } from '@/types'
import { deleteChat, getChat, listChats, upsertChat } from '@/utils/chatHistoryApi'

/**
 * 每条消息: { role: 'user' | 'assistant', content: string }
 * messagesByChatId: { [chatId]: Message[] }
 */
export const useChatStore = defineStore(
  'chat',
  () => {
    const currentChatId = ref<string | null>(null)
    const lastInterruptedChatId = ref<string | null>(null)
    const history = ref<ChatHistoryItem[]>([])
    const messagesByChatId = ref<Record<string, ChatMessage[]>>({}) // { [id]: [{ role, content }] }
    const undoState = ref<UndoState | null>(null)
    const isRegenerating = ref(false)
    let _regenerateAbort: AbortController | null = null // 供外部中止 regenerate

    // ===== 服务端持久化（防抖全量落库） =====
    let _initialized = false
    let _flushTimer: ReturnType<typeof setTimeout> | null = null
    const _dirtyChatIds = new Set<string>()
    const FLUSH_DEBOUNCE_MS = 1200

    const MAX_HISTORY = 50 // 最多保留 50 个会话
    const MAX_MESSAGES_PER_CHAT = 200 // 每个会话最多 200 条消息

    function getContentText(content: unknown): string {
      if (content == null) return ''
      if (typeof content === 'string') return content
      if (typeof content === 'object' && content !== null && 'text' in content)
        return (content as any).text != null ? String((content as any).text) : ''
      return ''
    }

    /**
     * 根据用户首条消息内容生成更自然的会话标题
     */
    function buildTitleFromContent(content: string): string {
      if (!content) return '新对话'
      let text = content.trim()

      // 去掉开头的引号和空白符（中英文引号）
      text = text.replace(/^[""'"'\s]+/, '')

      // 移除常见的客套/口头开头
      const prefixes = [
        '请帮我',
        '可以帮我',
        '麻烦你帮我',
        '麻烦你',
        '帮我',
        '我想要',
        '我想',
        '帮忙',
      ]
      let trimmed = true
      while (trimmed && text) {
        trimmed = false
        for (const prefix of prefixes) {
          if (text.startsWith(prefix)) {
            text = text.slice(prefix.length).trimStart()
            trimmed = true
            break
          }
        }
      }

      // 再次去掉开头可能残留的标点/引号
      text = text.replace(/^[，。,.""'"'\s]+/, '')

      // 优先按句号/问号/叹号截断
      const punctIndex = text.search(/[。！？?!]/)
      if (punctIndex > 0) {
        text = text.slice(0, punctIndex)
      }

      if (!text) return '新对话'

      const maxLen = 20
      if (text.length > maxLen) {
        return text.slice(0, maxLen) + '…'
      }
      return text
    }

    const currentChat = computed(() => history.value.find((c) => c.id === currentChatId.value))

    const currentMessages = computed((): ChatMessage[] => {
      if (!currentChatId.value) return []
      return messagesByChatId.value[currentChatId.value] ?? []
    })

    /** 切换当前会话 */
    function setCurrentChat(id: string | null): void {
      currentChatId.value = id
    }

    /** 新增一条会话到历史列表 */
    function addToHistory(chat: { id?: string; title?: string }): string {
      const id = chat.id || String(Date.now())
      const rawTitle = (chat.title || '').trim()
      const title = buildTitleFromContent(rawTitle)
      history.value.unshift({
        id,
        title,
        updatedAt: new Date().toISOString(),
      })
      // 淘汰最旧的会话
      while (history.value.length > MAX_HISTORY) {
        const removed = history.value.pop()
        if (removed) delete messagesByChatId.value[removed.id]
      }
      return id
    }

    /** 向当前会话追加一条消息（若无当前会话则自动创建） */
    function addMessage(role: 'user' | 'assistant', content: unknown): void {
      let chatId = currentChatId.value
      if (!chatId) {
        chatId = addToHistory({ title: getContentText(content) })
        currentChatId.value = chatId
      }
      if (!messagesByChatId.value[chatId]) messagesByChatId.value[chatId] = []
      const msgs = messagesByChatId.value[chatId]
      msgs.push({ role, content } as ChatMessage)
      // 淘汰最旧的消息
      while (msgs.length > MAX_MESSAGES_PER_CHAT) msgs.shift()
      // 更新该会话标题
      const list = history.value.find((c) => c.id === chatId)
      if (list && (list.title === '新对话' || !list.title)) {
        list.title = buildTitleFromContent(getContentText(content)) || '新对话'
        list.updatedAt = new Date().toISOString()
      }
      markDirty(chatId)
    }

    /** 将内容追加到当前会话最后一条助手消息末尾（流式补全） */
    function appendToLastMessage(content: string): void {
      const chatId = currentChatId.value
      if (!chatId || !messagesByChatId.value[chatId]?.length) return
      const last = messagesByChatId.value[chatId][messagesByChatId.value[chatId].length - 1]
      if (last.role === 'assistant') {
        ;(last as any).content += content
      }
      markDirty(chatId)
    }

    /** 覆盖当前会话最后一条助手消息内容 */
    function setLastAssistantMessage(content: string): void {
      const chatId = currentChatId.value
      if (!chatId || !messagesByChatId.value[chatId]?.length) return
      const last = messagesByChatId.value[chatId][messagesByChatId.value[chatId].length - 1]
      if (last.role === 'assistant') {
        last.content = content
      }
      markDirty(chatId)
    }

    /** 重命名指定会话 */
    function renameChat(id: string, newTitle: string): void {
      const item = history.value.find((c) => c.id === id)
      if (item && newTitle?.trim()) {
        item.title = newTitle.trim()
        item.updatedAt = new Date().toISOString()
      }
      markDirty(id)
    }

    /** 删除一轮对话：用户消息 + 紧随其后的 AI 回复 */
    function deleteTurnByUserIndex(chatId: string, userMessageIndex: number): void {
      const list = messagesByChatId.value[chatId]
      if (!list || userMessageIndex < 0 || userMessageIndex >= list.length) return
      if (list[userMessageIndex].role !== 'user') return
      const next = list[userMessageIndex + 1]
      const count = next?.role === 'assistant' ? 2 : 1
      const removed = list.splice(userMessageIndex, count)
      _saveUndo(chatId, removed, userMessageIndex)
      markDirty(chatId)
    }

    /** 删除一轮对话：用户消息 + 当前 AI 回复（由 AI 消息触发） */
    function deleteTurnByAssistantIndex(chatId: string, assistantMessageIndex: number): void {
      const list = messagesByChatId.value[chatId]
      if (!list || assistantMessageIndex <= 0 || assistantMessageIndex >= list.length) return
      if (list[assistantMessageIndex].role !== 'assistant') return
      if (list[assistantMessageIndex - 1].role !== 'user') return
      const removed = list.splice(assistantMessageIndex - 1, 2)
      _saveUndo(chatId, removed, assistantMessageIndex - 1)
      markDirty(chatId)
    }

    function _saveUndo(chatId: string, removedItems: ChatMessage[], insertIndex: number): void {
      if (undoState.value?.timer) clearTimeout(undoState.value.timer)
      const timer = setTimeout(() => {
        undoState.value = null
      }, 5000)
      undoState.value = { chatId, items: removedItems, insertIndex, timer }
    }

    function undoDelete(): void {
      if (!undoState.value) return
      const { chatId, items, insertIndex } = undoState.value
      const list = messagesByChatId.value[chatId]
      if (list) list.splice(insertIndex, 0, ...items)
      markDirty(chatId)
      undoState.value = null
    }

    /** 重新生成 AI 回复 */
    function regenerateReply(
      chatId: string,
      assistantMessageIndex: number,
      generateReply: ((userContent: string) => string) | null,
    ): void {
      const list = messagesByChatId.value[chatId]
      if (!list || assistantMessageIndex <= 0 || assistantMessageIndex >= list.length) return
      if (list[assistantMessageIndex].role !== 'assistant') return
      const userContent = String(list[assistantMessageIndex - 1]?.content || '')
      const newContent = generateReply
        ? generateReply(userContent)
        : `（重新生成）收到：「${userContent.slice(0, 50)}${userContent.length > 50 ? '…' : ''}」\n\n这是一条重新生成的模拟回复。`
      list[assistantMessageIndex].content = newContent
      markDirty(chatId)
    }

    /** 更新指定会话中某条消息的内容 */
    function updateMessage(chatId: string, messageIndex: number, newContent: string): void {
      const list = messagesByChatId.value[chatId]
      if (!list || messageIndex < 0 || messageIndex >= list.length) return
      list[messageIndex].content = newContent
      // 如果是用户的第一条消息，更新会话标题
      if (messageIndex === 0 && list[messageIndex].role === 'user') {
        const chat = history.value.find((c) => c.id === chatId)
        if (chat) {
          chat.title = buildTitleFromContent(newContent)
          chat.updatedAt = new Date().toISOString()
        }
      }
      markDirty(chatId)
    }

    /** 从历史中移除指定会话 */
    function removeFromHistory(id: string): void {
      history.value = history.value.filter((c) => c.id !== id)
      delete messagesByChatId.value[id]
      _dirtyChatIds.delete(id)
      deleteChat(id).catch(() => {})
      if (currentChatId.value === id) currentChatId.value = null
    }

    /** 清空所有会话与消息 */
    function clearHistory(): void {
      history.value = []
      messagesByChatId.value = {}
      currentChatId.value = null
    }

    // ===== 服务端持久化 =====

    let _boundUnload = false

    /** 全量保存单个会话到服务端 */
    async function flushChat(chatId: string | null | undefined): Promise<void> {
      if (!chatId) return
      const list = history.value.find((c) => c.id === chatId)
      if (!list) return
      const messages = messagesByChatId.value[chatId] ?? []
      try {
        await upsertChat(chatId, {
          title: list.title,
          updatedAt: Date.parse(list.updatedAt) || Date.now(),
          messages,
        })
      } catch {
        /* 网络失败不阻塞本地，后续 markDirty 会再次触发 */
      }
    }

    /** 标记某会话待保存，1.2s 防抖批量落库（流式期间由整体替换自愈） */
    function markDirty(chatId: string | null | undefined): void {
      if (!chatId) return
      _dirtyChatIds.add(chatId)
      if (_flushTimer) return
      _flushTimer = setTimeout(async () => {
        _flushTimer = null
        const ids = [..._dirtyChatIds]
        _dirtyChatIds.clear()
        for (const id of ids) await flushChat(id)
      }, FLUSH_DEBOUNCE_MS)
    }

    /** 立即保存所有待保存会话（换页/关页前调用） */
    function flushPending(): void {
      if (_flushTimer) {
        clearTimeout(_flushTimer)
        _flushTimer = null
      }
      const ids = [..._dirtyChatIds]
      _dirtyChatIds.clear()
      ids.forEach((id) => flushChat(id))
    }

    /** 一次性迁移旧 localStorage 数据到服务端（防升级丢数据） */
    async function migrateLocalOnce(): Promise<void> {
      try {
        const raw = localStorage.getItem('chat')
        if (!raw) return
        const old = JSON.parse(raw)
        const oldHistory: ChatHistoryItem[] = Array.isArray(old?.history) ? old.history : []
        const oldMessages: Record<string, ChatMessage[]> = old?.messagesByChatId || {}
        for (const c of oldHistory) {
          const messages = Array.isArray(oldMessages[c.id]) ? oldMessages[c.id] : []
          await upsertChat(c.id, {
            title: c.title,
            updatedAt: Date.parse(c.updatedAt) || Date.now(),
            messages,
          })
        }
        localStorage.removeItem('chat')
      } catch {
        /* 迁移失败不影响启动 */
      }
    }

    /** 初始化：拉取服务端会话列表 + 一次性迁移；重复调用忽略 */
    async function init(): Promise<void> {
      if (_initialized) return
      _initialized = true
      try {
        const chats = await listChats()
        if (chats.length > 0) {
          history.value = chats.map((c) => ({
            id: c.id,
            title: c.title || '新对话',
            updatedAt: c.updatedAt,
          }))
        }
      } catch {
        /* 拉取失败保持内存态 */
      }
      if (!_boundUnload) {
        _boundUnload = true
        if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPending)
      }
      if (history.value.length === 0) await migrateLocalOnce()
    }

    /** 打开会话：切换当前会话，未加载时从服务端拉取消息 */
    async function openChat(id: string | null): Promise<void> {
      currentChatId.value = id
      if (!id) return
      if (messagesByChatId.value[id] !== undefined) return // 已加载
      try {
        const data = await getChat(id)
        messagesByChatId.value[id] = (data.messages ?? []) as ChatMessage[]
        if (!history.value.find((c) => c.id === id)) {
          history.value.unshift({
            id,
            title: data.chat.title || '新对话',
            updatedAt: data.chat.updatedAt,
          })
        }
      } catch {
        /* 服务端无此会话（404/网络错误），保持当前状态 */
      }
    }

    function setRegenerateAbort(controller: AbortController): void {
      _regenerateAbort = controller
    }

    function abortRegenerate(): void {
      if (_regenerateAbort) {
        try {
          _regenerateAbort.abort()
        } catch {
          /* ignore */
        }
        _regenerateAbort = null
      }
      isRegenerating.value = false
    }

    return {
      currentChatId,
      lastInterruptedChatId,
      history,
      messagesByChatId,
      currentChat,
      currentMessages,
      setCurrentChat,
      init,
      openChat,
      markDirty,
      flushPending,
      addToHistory,
      addMessage,
      appendToLastMessage,
      setLastAssistantMessage,
      renameChat,
      undoState,
      undoDelete,
      deleteTurnByUserIndex,
      deleteTurnByAssistantIndex,
      regenerateReply,
      updateMessage,
      removeFromHistory,
      clearHistory,
      isRegenerating,
      setRegenerateAbort,
      abortRegenerate,
    }
  },
  {},
)
