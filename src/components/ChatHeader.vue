<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

const currentTitle = computed(() => {
  if (chatStore.currentChat?.title) return chatStore.currentChat.title
  if (chatStore.currentChatId)
    return chatStore.history.find((c) => c.id === chatStore.currentChatId)?.title || 'New Chat'
  return 'New Chat'
})

const emit = defineEmits(['openRenameModal'])

function handleRenameClick() {
  if (chatStore.currentChatId) {
    emit('openRenameModal')
  }
}
</script>

<template>
  <header class="flex min-h-[56px] shrink-0 items-center justify-between gap-2 border-b border-border bg-background/80 backdrop-blur-md px-4">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <span class="truncate text-sm font-semibold tracking-tight text-text-primary">{{ currentTitle }}</span>
      <button
        v-if="chatStore.currentChatId"
        type="button"
        class="shrink-0 rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
        aria-label="重命名会话"
        v-tooltip="'重命名会话'"
        @click="handleRenameClick"
      >
        <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
      </button>
    </div>
  </header>
</template>
