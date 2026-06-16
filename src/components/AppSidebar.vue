<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useAppStore } from '@/stores/app'
import { useChatStore } from '@/stores/chat'
import Logo from './Logo.vue'
import Modal from './Modal.vue'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const chatStore = useChatStore()

const searchQuery = ref('')
const debouncedQuery = ref('')
let debounceTimer = null

watch(searchQuery, (val) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = val
  }, 200)
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
})

const filteredHistory = computed(() => {
  const q = debouncedQuery.value.trim().toLowerCase()
  if (!q) return chatStore.history
  return chatStore.history.filter((c) => c.title.toLowerCase().includes(q))
})

const isRenameModalOpen = ref(false)
const renamingChatId = ref(null)
const newChatTitle = ref('')

const isDeleteModalOpen = ref(false)
const deletingChatId = ref(null)

function goNewChat() {
  chatStore.setCurrentChat(null)
  router.push({ name: 'Chat' })
  appStore.closeSidebar()
}

function goInterview() {
  router.push({ name: 'Interview' })
  appStore.closeSidebar()
}

function goStats() {
  router.push({ name: 'Stats' })
  appStore.closeSidebar()
}

function goKnowledge() {
  router.push({ name: 'Knowledge' })
  appStore.closeSidebar()
}

function goChat(id) {
  chatStore.setCurrentChat(id)
  router.push({ name: 'ChatById', params: { id } })
  appStore.closeSidebar()
}

function startRename(item) {
  renamingChatId.value = item.id
  newChatTitle.value = item.title
  isRenameModalOpen.value = true
}

function closeRenameModal() {
  isRenameModalOpen.value = false
  renamingChatId.value = null
  newChatTitle.value = ''
}

function saveRename() {
  if (renamingChatId.value) {
    const trimmedTitle = newChatTitle.value.trim()
    if (trimmedTitle) {
      chatStore.renameChat(renamingChatId.value, trimmedTitle)
    }
  }
  closeRenameModal()
}

function handleDelete(id, e) {
  e?.stopPropagation()
  deletingChatId.value = id
  isDeleteModalOpen.value = true
}

function confirmDelete() {
  if (deletingChatId.value) {
    chatStore.removeFromHistory(deletingChatId.value)
    if (chatStore.currentChatId === deletingChatId.value) {
      router.push({ name: 'Chat' })
    }
  }
  closeDeleteModal()
}

function closeDeleteModal() {
  isDeleteModalOpen.value = false
  deletingChatId.value = null
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Logo area -->
    <div class="flex min-h-[56px] items-center gap-2 border-b border-border px-3">
      <button
        v-tooltip="'展开 / 收起侧边栏'"
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        aria-label="切换侧边栏"
        @click="appStore.toggleSidebar"
      >
        <Icon icon="lucide:menu" class="h-[18px] w-[18px]" />
      </button>
      <router-link
        v-show="!appStore.sidebarCollapsed"
        to="/"
        class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-text-primary"
      >
        <Logo :size="26" show-text />
      </router-link>
    </div>

    <!-- New chat -->
    <div class="border-b border-border p-2">
      <button
        v-tooltip="'新建一个空白对话'"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-text-secondary transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        aria-label="新建对话"
        @click="goNewChat"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary"
        >
          <Icon icon="lucide:pen-square" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">新建对话</span>
      </button>
    </div>

    <!-- 功能导航 -->
    <div class="border-b border-border p-2">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200"
        :class="
          route.name === 'Interview'
            ? 'bg-primary-muted text-primary'
            : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'
        "
        @click="goInterview"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          :class="
            route.name === 'Interview'
              ? 'bg-primary-muted text-primary'
              : 'bg-surface-input text-text-secondary'
          "
        >
          <Icon icon="lucide:presentation" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">AI 面试</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200"
        :class="
          route.name === 'Knowledge'
            ? 'bg-primary-muted text-primary'
            : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'
        "
        @click="goKnowledge"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          :class="
            route.name === 'Knowledge'
              ? 'bg-primary-muted text-primary'
              : 'bg-surface-input text-text-secondary'
          "
        >
          <Icon icon="lucide:database" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">知识库</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200"
        :class="
          route.name === 'Stats'
            ? 'bg-primary-muted text-primary'
            : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'
        "
        @click="goStats"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          :class="
            route.name === 'Stats'
              ? 'bg-primary-muted text-primary'
              : 'bg-surface-input text-text-secondary'
          "
        >
          <Icon icon="lucide:bar-chart-3" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">面试记录</span>
      </button>
    </div>

    <!-- Chat history -->
    <nav v-if="!appStore.sidebarCollapsed" class="flex flex-1 flex-col overflow-hidden p-2">
      <!-- Search -->
      <div v-if="chatStore.history.length > 0" class="shrink-0 px-1 pb-2">
        <div class="relative">
          <Icon
            icon="lucide:search"
            class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
          />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索对话..."
            class="w-full rounded-lg border border-border bg-surface-input py-1.5 pl-8 pr-7 text-xs text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none transition-colors"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
            aria-label="清空搜索"
            @click="searchQuery = ''"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
          </button>
        </div>
      </div>
      <ul
        v-if="filteredHistory.length > 0"
        class="flex-1 overflow-y-auto space-y-0.5 thin-scrollbar"
      >
        <li v-for="item in filteredHistory" :key="item.id" class="group">
          <div
            class="relative flex items-center gap-1 rounded-lg px-2 py-2 transition-colors duration-200"
            :class="
              chatStore.currentChatId === item.id
                ? 'bg-primary-muted text-primary'
                : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'
            "
          >
            <!-- Active indicator bar -->
            <span
              v-if="chatStore.currentChatId === item.id"
              class="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
            />
            <button
              v-tooltip="item.title"
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left"
              @click="goChat(item.id)"
            >
              <Icon icon="lucide:message-square" class="h-[18px] w-[18px] shrink-0" />
              <span class="min-w-0 truncate text-sm">{{ item.title }}</span>
            </button>
            <div
              class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              <button
                v-tooltip="'重命名'"
                type="button"
                class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                aria-label="重命名"
                @click.stop="startRename(item)"
              >
                <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
              </button>
              <button
                v-tooltip="'删除'"
                type="button"
                class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                aria-label="删除"
                @click="handleDelete(item.id, $event)"
              >
                <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </li>
      </ul>
      <div
        v-else-if="debouncedQuery.trim()"
        class="flex flex-col items-center justify-center py-12 text-center"
      >
        <Icon icon="lucide:search" class="h-8 w-8 text-text-muted/30 mb-3" />
        <p class="text-xs text-text-muted">未找到匹配的对话</p>
      </div>
      <div v-else class="flex flex-col items-center justify-center py-12 text-center">
        <Icon icon="lucide:message-square" class="h-8 w-8 text-text-muted/30 mb-3" />
        <p class="text-xs text-text-muted">暂无对话记录</p>
        <p class="mt-1 text-[11px] text-text-muted/60">点击上方按钮新建对话</p>
      </div>
    </nav>

    <!-- Theme toggle -->
    <div class="shrink-0 border-t border-border p-2">
      <button
        v-tooltip="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-text-secondary transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        :aria-label="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        @click="appStore.toggleTheme()"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-input text-text-secondary"
        >
          <Icon v-if="appStore.isDark" icon="lucide:sun" class="h-[18px] w-[18px]" />
          <Icon v-else icon="lucide:moon" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">{{
          appStore.isDark ? '日间模式' : '夜间模式'
        }}</span>
      </button>
    </div>

    <!-- Rename modal -->
    <Modal
      :show="isRenameModalOpen"
      title="重命名此对话"
      confirm-text="重命名"
      @close="closeRenameModal"
      @confirm="saveRename"
    >
      <input
        v-model="newChatTitle"
        type="text"
        class="w-full rounded-lg border border-border bg-surface-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors duration-200"
        placeholder="请输入对话标题..."
        maxlength="50"
      />
    </Modal>

    <!-- Delete modal -->
    <Modal
      :show="isDeleteModalOpen"
      title="要删除对话吗？"
      confirm-text="删除"
      cancel-text="取消"
      confirm-variant="danger"
      @close="closeDeleteModal"
      @confirm="confirmDelete"
    >
      <p class="text-sm text-text-secondary">
        此操作将从应用活动记录中删除提示、回答和反馈，以及你创建的所有内容。
      </p>
    </Modal>
  </div>
</template>
