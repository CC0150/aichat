<script setup>
import { ref } from 'vue'
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
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        aria-label="切换侧边栏"
        v-tooltip="'展开 / 收起侧边栏'"
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
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-text-secondary transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        aria-label="新建对话"
        v-tooltip="'新建一个空白对话'"
        @click="goNewChat"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
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
        :class="route.name === 'Interview'
          ? 'bg-primary-muted text-primary'
          : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'"
        @click="goInterview"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          :class="route.name === 'Interview' ? 'bg-primary-muted text-primary' : 'bg-surface-input text-text-secondary'"
        >
          <Icon icon="lucide:presentation" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">面试教练</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200"
        :class="route.name === 'Stats'
          ? 'bg-primary-muted text-primary'
          : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'"
        @click="goStats"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          :class="route.name === 'Stats' ? 'bg-primary-muted text-primary' : 'bg-surface-input text-text-secondary'"
        >
          <Icon icon="lucide:bar-chart-3" class="h-[18px] w-[18px]" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate text-sm font-medium">学习统计</span>
      </button>
    </div>

    <!-- Chat history -->
    <nav v-if="!appStore.sidebarCollapsed" class="flex-1 overflow-y-auto p-2">
      <ul class="space-y-0.5">
        <li v-for="item in chatStore.history" :key="item.id" class="group">
          <div
            class="relative flex items-center gap-1 rounded-lg px-2 py-2 transition-colors duration-200"
            :class="chatStore.currentChatId === item.id
              ? 'bg-primary-muted text-primary'
              : 'text-text-secondary hover:bg-surface-input hover:text-text-primary'"
          >
            <!-- Active indicator bar -->
            <span
              v-if="chatStore.currentChatId === item.id"
              class="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
            />
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left"
              v-tooltip="item.title"
              @click="goChat(item.id)"
            >
              <Icon icon="lucide:message-square" class="h-[18px] w-[18px] shrink-0" />
              <span class="min-w-0 truncate text-sm">{{ item.title }}</span>
            </button>
            <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <button
                type="button"
                class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                aria-label="重命名"
                v-tooltip="'重命名'"
                @click.stop="startRename(item)"
              >
                <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                aria-label="删除"
                v-tooltip="'删除'"
                @click="handleDelete(item.id, $event)"
              >
                <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </li>
      </ul>
    </nav>

    <!-- Theme toggle -->
    <div class="shrink-0 border-t border-border p-2">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-text-secondary transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
        :aria-label="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        v-tooltip="appStore.isDark ? '切换为日间模式' : '切换为夜间模式'"
        @click="appStore.toggleTheme()"
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-input text-text-secondary">
          <Icon v-if="appStore.isDark" icon="lucide:sun" class="h-[18px] w-[18px]" />
          <Icon v-else icon="lucide:moon" class="h-[18px] w-[18px]" />
        </span>
        <span
          v-if="!appStore.sidebarCollapsed"
          class="truncate text-sm font-medium"
        >{{ appStore.isDark ? '日间模式' : '夜间模式' }}</span>
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
