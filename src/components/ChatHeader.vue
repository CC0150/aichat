<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useAppStore } from '@/stores/app'
import { useChatStore } from '@/stores/chat'

const appStore = useAppStore()
const chatStore = useChatStore()

const currentTitle = computed(() => {
  if (chatStore.currentChat?.title) return chatStore.currentChat.title
  if (chatStore.currentChatId)
    return chatStore.history.find((c) => c.id === chatStore.currentChatId)?.title || '新对话'
  return '新对话'
})

// 通知父组件打开重命名模态框
const emit = defineEmits(['openRenameModal'])

function handleRenameClick() {
  if (chatStore.currentChatId) {
    emit('openRenameModal')
  }
}
</script>

<template>
  <header class="flex min-h-[56px] shrink-0 items-center justify-between gap-2 border-b border-border px-4">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-elevated hover:text-text-primary lg:hidden"
        aria-label="打开菜单" @click="appStore.toggleMobileDrawer()">
        <Icon icon="lucide:menu" class="h-5 w-5" />
      </button>
      <span class="truncate text-sm font-medium text-text-primary">{{ currentTitle }}</span>
      <button
        v-if="chatStore.currentChatId"
        type="button"
        class="shrink-0 rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
        aria-label="重命名会话"
        @click="handleRenameClick"
      >
        <Icon icon="lucide:pencil" class="h-4 w-4" />
      </button>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        :aria-label="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        :title="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        @click="appStore.toggleTheme()"
      >
        <Icon v-if="appStore.isDark" icon="lucide:sun" class="h-5 w-5" />
        <Icon v-else icon="lucide:moon" class="h-5 w-5" />
      </button>
      <span class="hidden text-sm font-medium text-text-secondary sm:inline">PRO</span>
      <button type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-surface-elevated text-sm font-medium text-text-primary"
        aria-label="用户">
        <Icon icon="lucide:user" class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
