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
      <button
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-200 hover:bg-surface-input hover:text-text-primary lg:hidden"
        aria-label="打开菜单"
        @click="appStore.toggleMobileDrawer()"
      >
        <Icon icon="lucide:menu" class="h-[18px] w-[18px]" />
      </button>
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

    <div class="flex shrink-0 items-center gap-1">
      <!-- Theme toggle -->
      <button
        type="button"
        class="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        :aria-label="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        v-tooltip="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        @click="appStore.toggleTheme()"
      >
        <Icon v-if="appStore.isDark" icon="lucide:sun" class="h-[18px] w-[18px]" />
        <Icon v-else icon="lucide:moon" class="h-[18px] w-[18px]" />
      </button>

      <!-- User -->
      <div class="flex items-center gap-2 ml-1 pl-2 border-l border-border">
        <span class="hidden text-[13px] font-medium text-text-secondary sm:inline">下雨天</span>
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-muted text-primary ring-1 ring-primary-muted"
          aria-label="用户"
        >
          <Icon icon="lucide:user" class="h-[15px] w-[15px]" />
        </div>
      </div>
    </div>
  </header>
</template>
