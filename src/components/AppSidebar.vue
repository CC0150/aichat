<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useAppStore } from '@/stores/app'
import { useChatStore } from '@/stores/chat'
import Modal from './Modal.vue'

const router = useRouter()
const appStore = useAppStore()
const chatStore = useChatStore()

// 重命名模态框相关
const isRenameModalOpen = ref(false)
const renamingChatId = ref(null)
const newChatTitle = ref('')

// 删除模态框相关
const isDeleteModalOpen = ref(false)
const deletingChatId = ref(null)

function goNewChat() {
  chatStore.setCurrentChat(null)
  router.push({ name: 'Chat' })
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
    <!-- 顶部：Logo + 折叠按钮 -->
    <div class="flex min-h-[56px] items-center gap-2 border-b border-border px-3">
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
        aria-label="切换侧边栏"
        title="展开 / 收起侧边栏"
        @click="appStore.toggleSidebar"
      >
        <Icon icon="lucide:menu" class="h-5 w-5" />
      </button>
      <router-link to="/" class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-text-primary">
        <span class="truncate font-medium">AIChat</span>
      </router-link>
    </div>

    <!-- 新建对话 -->
    <div class="border-b border-border p-2">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-text-primary hover:bg-surface-elevated"
        aria-label="新建对话"
        title="新建一个空白对话"
        @click="goNewChat"
      >
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
          <Icon icon="lucide:pen-square" class="h-5 w-5" />
        </span>
        <span v-if="!appStore.sidebarCollapsed" class="truncate">新建对话</span>
      </button>
    </div>

    <!-- 历史会话：仅侧边栏展开时显示 -->
    <nav v-if="!appStore.sidebarCollapsed" class="flex-1 overflow-y-auto p-2">
      <ul class="space-y-0.5">
        <li v-for="item in chatStore.history" :key="item.id" class="group">
          <div class="flex items-center gap-1 rounded-lg px-2 py-2"
            :class="chatStore.currentChatId === item.id ? 'bg-surface-elevated text-primary' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left"
              :title="item.title"
              @click="goChat(item.id)"
            >
              <Icon icon="lucide:message-square" class="h-5 w-5 shrink-0" />
              <span class="min-w-0 truncate">{{ item.title }}</span>
            </button>
            <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" class="rounded p-1 text-text-muted hover:bg-surface-input hover:text-text-primary"
                aria-label="重命名" @click.stop="startRename(item)">
                <Icon icon="lucide:pencil" class="h-4 w-4" />
              </button>
              <button type="button" class="rounded p-1 text-text-muted hover:bg-red-500/20 hover:text-red-400"
                aria-label="删除" @click="handleDelete(item.id, $event)">
                <Icon icon="lucide:trash-2" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </li>
      </ul>
    </nav>

    <!-- 重命名对话模态框 -->
    <Modal :show="isRenameModalOpen" title="重命名此对话" confirm-text="重命名" @close="closeRenameModal" @confirm="saveRename">
      <input v-model="newChatTitle" type="text"
        class="w-full rounded-lg border border-border bg-surface-input px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="请输入对话标题..." maxlength="50" />
    </Modal>

    <!-- 删除对话模态框 -->
    <Modal :show="isDeleteModalOpen" title="要删除对话吗？" confirm-text="删除" cancel-text="取消" confirm-variant="danger"
      @close="closeDeleteModal" @confirm="confirmDelete">
      <p class="text-text-secondary">此操作将从应用活动记录中删除提示、回答和反馈，以及你创建的所有内容。</p>
    </Modal>
  </div>
</template>
