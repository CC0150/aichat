<script setup lang="ts">
// @ts-nocheck
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '@/stores/chat'

/** 聊天状态（当前对话、历史记录等） */
const chatStore = useChatStore()

/**
 * 当前对话标题
 * 优先使用 chatStore 中当前对话对象的 title，
 * 其次从历史记录中查找匹配 ID 的标题，
 * 都没有则显示默认标题 "New Chat"
 */
const currentTitle = computed(() => {
  if (chatStore.currentChat?.title) return chatStore.currentChat.title
  if (chatStore.currentChatId)
    return chatStore.history.find((c) => c.id === chatStore.currentChatId)?.title || 'New Chat'
  return 'New Chat'
})

/** 向父组件发送打开重命名弹窗事件 */
const emit = defineEmits(['openRenameModal'])

/** 触发重命名弹窗（仅当存在当前对话时） */
function handleRenameClick() {
  if (chatStore.currentChatId) {
    emit('openRenameModal')
  }
}
</script>

<template>
  <header
    class="relative flex min-h-[58px] shrink-0 items-center justify-between gap-2 bg-background/70 px-4 backdrop-blur-md sm:px-6"
  >
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <span class="truncate font-display text-[15px] font-normal tracking-wide text-text-primary">{{
        currentTitle
      }}</span>
      <button
        v-if="chatStore.currentChatId"
        v-tooltip="'重命名会话'"
        type="button"
        class="shrink-0 rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
        aria-label="重命名会话"
        @click="handleRenameClick"
      >
        <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
      </button>
    </div>
    <span
      class="absolute bottom-0 left-0 h-px w-16 bg-primary/70 transition-all duration-500"
      aria-hidden="true"
    />
  </header>
</template>
