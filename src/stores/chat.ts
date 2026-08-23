import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage, ChatHistoryItem, UndoState } from '@/types'

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
    }

    /** 将内容追加到当前会话最后一条助手消息末尾（流式补全） */
    function appendToLastMessage(content: string): void {
      const chatId = currentChatId.value
      if (!chatId || !messagesByChatId.value[chatId]?.length) return
      const last = messagesByChatId.value[chatId][messagesByChatId.value[chatId].length - 1]
      if (last.role === 'assistant') {
        ;(last as any).content += content
      }
    }

    /** 覆盖当前会话最后一条助手消息内容 */
    function setLastAssistantMessage(content: string): void {
      const chatId = currentChatId.value
      if (!chatId || !messagesByChatId.value[chatId]?.length) return
      const last = messagesByChatId.value[chatId][messagesByChatId.value[chatId].length - 1]
      if (last.role === 'assistant') {
        last.content = content
      }
    }

    /** 重命名指定会话 */
    function renameChat(id: string, newTitle: string): void {
      const item = history.value.find((c) => c.id === id)
      if (item && newTitle?.trim()) {
        item.title = newTitle.trim()
        item.updatedAt = new Date().toISOString()
      }
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
    }

    /** 删除一轮对话：用户消息 + 当前 AI 回复（由 AI 消息触发） */
    function deleteTurnByAssistantIndex(chatId: string, assistantMessageIndex: number): void {
      const list = messagesByChatId.value[chatId]
      if (!list || assistantMessageIndex <= 0 || assistantMessageIndex >= list.length) return
      if (list[assistantMessageIndex].role !== 'assistant') return
      if (list[assistantMessageIndex - 1].role !== 'user') return
      const removed = list.splice(assistantMessageIndex - 1, 2)
      _saveUndo(chatId, removed, assistantMessageIndex - 1)
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
    }

    /** 从历史中移除指定会话 */
    function removeFromHistory(id: string): void {
      history.value = history.value.filter((c) => c.id !== id)
      delete messagesByChatId.value[id]
      if (currentChatId.value === id) currentChatId.value = null
    }

    /** 清空所有会话与消息 */
    function clearHistory(): void {
      history.value = []
      messagesByChatId.value = {}
      currentChatId.value = null
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
  {
    persist: true,
  },
)
