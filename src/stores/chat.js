import { defineStore } from "pinia";
import { ref, computed } from "vue";

/**
 * 每条消息: { role: 'user' | 'assistant', content: string }
 * messagesByChatId: { [chatId]: Message[] }
 */
export const useChatStore = defineStore(
  "chat",
  () => {
    const currentChatId = ref(null);
    const lastInterruptedChatId = ref(null);
    const history = ref([
      { id: "1", title: "Vue 3 响应式原理深入解析", updatedAt: "2026-06-14T10:00:00" },
      {
        id: "2",
        title: "手写防抖与节流函数",
        updatedAt: "2026-06-13T15:30:00",
      },
    ]);
    const messagesByChatId = ref({}); // { [id]: [{ role, content }] }

    function getContentText(content) {
      if (content == null) return ""
      if (typeof content === "string") return content
      if (typeof content === "object" && "text" in content) return content.text != null ? String(content.text) : ""
      return ""
    }

    /**
     * 根据用户首条消息内容生成更自然的会话标题
     * - 去掉常见的口头开头（如“帮我”“请帮我”“我想要”）
     * - 优先截取第一个句号/问号/叹号之前的内容
     * - 最长 20 个字符，超出则添加省略号
     * @param {string} content 用户首条消息
     * @returns {string} 会话标题
     */
    function buildTitleFromContent(content) {
      if (!content) return "新对话";
      let text = content.trim();

      // 去掉开头的引号和空白符（中英文引号）
      text = text.replace(/^[“”"'\s]+/, "");

      // 移除常见的客套/口头开头（尽量多覆盖一些组合）
      const prefixes = [
        "请帮我",
        "可以帮我",
        "麻烦你帮我",
        "麻烦你",
        "帮我",
        "我想要",
        "我想",
        "帮忙",
      ];
      let trimmed = true;
      while (trimmed && text) {
        trimmed = false;
        for (const prefix of prefixes) {
          if (text.startsWith(prefix)) {
            text = text.slice(prefix.length).trimStart();
            trimmed = true;
            break;
          }
        }
      }

      // 再次去掉开头可能残留的标点/引号
      text = text.replace(/^[，。,.“”"'\s]+/, "");

      // 优先按句号/问号/叹号截断
      const punctIndex = text.search(/[。！？\?!]/);
      if (punctIndex > 0) {
        text = text.slice(0, punctIndex);
      }

      if (!text) return "新对话";

      const maxLen = 20;
      if (text.length > maxLen) {
        return text.slice(0, maxLen) + "…";
      }
      return text;
    }

    const currentChat = computed(() =>
      history.value.find((c) => c.id === currentChatId.value),
    );

    const currentMessages = computed(() => {
      if (!currentChatId.value) return [];
      return messagesByChatId.value[currentChatId.value] ?? [];
    });

    /**
     * 切换当前会话（不修改会话内容）
     * @param {string|null} id 会话 id
     */
    function setCurrentChat(id) {
      currentChatId.value = id;
    }

    /**
     * 新增一条会话到历史列表
     * @param {{ id?: string, title?: string }} chat
     * @returns {string} 新会话 id
     */
    function addToHistory(chat) {
      const id = chat.id || String(Date.now());
      const rawTitle = (chat.title || "").trim();
      const title = buildTitleFromContent(rawTitle);
      history.value.unshift({
        id,
        title,
        updatedAt: new Date().toISOString(),
      });
      return id;
    }

    /**
     * 向当前会话追加一条消息（若无当前会话则自动创建）
     * @param {'user'|'assistant'} role
     * @param {string|any} content
     */
    function addMessage(role, content) {
      let chatId = currentChatId.value;
      if (!chatId) {
        chatId = addToHistory({ title: getContentText(content) });
        currentChatId.value = chatId;
      }
      if (!messagesByChatId.value[chatId]) messagesByChatId.value[chatId] = [];
      messagesByChatId.value[chatId].push({ role, content });
      // 更新该会话标题（仅当第一条为用户消息时）
      const list = history.value.find((c) => c.id === chatId);
      if (list && (list.title === "新对话" || !list.title)) {
        list.title = buildTitleFromContent(getContentText(content)) || "新对话";
        list.updatedAt = new Date().toISOString();
      }
    }

    /**
     * 将内容追加到当前会话最后一条助手消息末尾
     * 主要用于流式补全逐块拼接
     * @param {string} content
     */
    function appendToLastMessage(content) {
      const chatId = currentChatId.value;
      if (!chatId || !messagesByChatId.value[chatId]?.length) return;
      const last =
        messagesByChatId.value[chatId][
          messagesByChatId.value[chatId].length - 1
        ];
      if (last.role === "assistant") last.content += content;
    }

    /**
     * 覆盖当前会话最后一条助手消息内容
     * 常用于显示错误信息或重置回复
     * @param {string} content
     */
    function setLastAssistantMessage(content) {
      const chatId = currentChatId.value;
      if (!chatId || !messagesByChatId.value[chatId]?.length) return;
      const last =
        messagesByChatId.value[chatId][
          messagesByChatId.value[chatId].length - 1
        ];
      if (last.role === "assistant") last.content = content;
    }

    /**
     * 重命名指定会话
     * @param {string} id 会话 id
     * @param {string} newTitle 新标题
     */
    function renameChat(id, newTitle) {
      const item = history.value.find((c) => c.id === id);
      if (item && newTitle?.trim()) {
        item.title = newTitle.trim();
        item.updatedAt = new Date().toISOString();
      }
    }

    /**
     * 删除一轮对话：用户消息 + 紧随其后的 AI 回复
     * @param chatId 会话 id
     * @param userMessageIndex 用户消息在 currentMessages 中的下标
     */
    function deleteTurnByUserIndex(chatId, userMessageIndex) {
      const list = messagesByChatId.value[chatId];
      if (!list || userMessageIndex < 0 || userMessageIndex >= list.length)
        return;
      if (list[userMessageIndex].role !== "user") return;
      const next = list[userMessageIndex + 1];
      if (next?.role === "assistant") {
        list.splice(userMessageIndex, 2);
      } else {
        list.splice(userMessageIndex, 1);
      }
    }

    /**
     * 删除一轮对话：用户消息 + 当前 AI 回复（由 AI 消息触发）
     * @param chatId 会话 id
     * @param assistantMessageIndex AI 消息在 currentMessages 中的下标
     */
    function deleteTurnByAssistantIndex(chatId, assistantMessageIndex) {
      const list = messagesByChatId.value[chatId];
      if (
        !list ||
        assistantMessageIndex <= 0 ||
        assistantMessageIndex >= list.length
      )
        return;
      if (list[assistantMessageIndex].role !== "assistant") return;
      if (list[assistantMessageIndex - 1].role !== "user") return;
      list.splice(assistantMessageIndex - 1, 2);
    }

    /**
     * 重新生成 AI 回复：根据上一条用户消息重新生成并替换当前 AI 内容
     * @param chatId 会话 id
     * @param assistantMessageIndex AI 消息下标
     * @param generateReply 可选，函数 (userContent) => newReplyContent，不传则用默认模拟
     */
    function regenerateReply(chatId, assistantMessageIndex, generateReply) {
      const list = messagesByChatId.value[chatId];
      if (
        !list ||
        assistantMessageIndex <= 0 ||
        assistantMessageIndex >= list.length
      )
        return;
      if (list[assistantMessageIndex].role !== "assistant") return;
      const userContent = list[assistantMessageIndex - 1]?.content || "";
      const newContent = generateReply
        ? generateReply(userContent)
        : `（重新生成）收到：「${userContent.slice(0, 50)}${userContent.length > 50 ? "…" : ""}」\n\n这是一条重新生成的模拟回复。`;
      list[assistantMessageIndex].content = newContent;
    }

    /**
     * 更新指定会话中某条消息的内容
     * @param {string} chatId 会话 id
     * @param {number} messageIndex 消息下标
     * @param {string} newContent 新内容
     */
    function updateMessage(chatId, messageIndex, newContent) {
      const list = messagesByChatId.value[chatId];
      if (!list || messageIndex < 0 || messageIndex >= list.length) return;
      list[messageIndex].content = newContent;
      // 如果是用户的第一条消息，更新会话标题
      if (messageIndex === 0 && list[messageIndex].role === "user") {
        const chat = history.value.find((c) => c.id === chatId);
        if (chat) {
          chat.title = buildTitleFromContent(newContent);
          chat.updatedAt = new Date().toISOString();
        }
      }
    }

    /**
     * 从历史中移除指定会话，并删除其所有消息
     * @param {string} id 会话 id
     */
    function removeFromHistory(id) {
      history.value = history.value.filter((c) => c.id !== id);
      delete messagesByChatId.value[id];
      if (currentChatId.value === id) currentChatId.value = null;
    }

    /**
     * 清空所有会话与消息
     */
    function clearHistory() {
      history.value = [];
      messagesByChatId.value = {};
      currentChatId.value = null;
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
      deleteTurnByUserIndex,
      deleteTurnByAssistantIndex,
      regenerateReply,
      updateMessage,
      removeFromHistory,
      clearHistory,
    };
  },
  {
    persist: true,
  },
);
