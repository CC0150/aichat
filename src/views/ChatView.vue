<script setup lang="ts">
// @ts-nocheck
import { watch, ref } from 'vue'
import { useRoute } from 'vue-router'
import ChatHeader from '@/components/ChatHeader.vue'
import MessageArea from '@/components/MessageArea.vue'
import ChatInput from '@/components/ChatInput.vue'
import { useChatStore } from '@/stores/chat'

/** 当前路由信息（用于获取 URL 中的对话 ID） */
const route = useRoute()
/** 聊天状态（历史、消息、当前对话等） */
const chatStore = useChatStore()
/** ChatInput 子组件引用（用于外部触发发送/继续生成） */
const chatInputRef = ref<any>(null)

/** 控制重命名模态框的显示 */
const showRenameModal = ref(false)

/**
 * 监听路由参数变化，同步当前对话 ID 到 store
 * immediate: true 确保首次加载时也执行
 */
watch(
  () => route.params.id,
  (id) => {
    chatStore.setCurrentChat(id ?? null)
  },
  { immediate: true },
)

/** 响应 ChatHeader 的点击 → 打开重命名弹窗 */
function handleOpenRenameModal() {
  showRenameModal.value = true
}

/** 关闭重命名弹窗 */
function handleCloseRenameModal() {
  showRenameModal.value = false
}

/** 将建议/快捷提问内容转发给 ChatInput 的 sendMessage */
function handleSendMessage(content) {
  if (chatInputRef.value) {
    chatInputRef.value.sendMessage(content)
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <ChatHeader @open-rename-modal="handleOpenRenameModal" />
    <MessageArea
      :show-rename-modal="showRenameModal"
      @close-rename-modal="handleCloseRenameModal"
      @send-message="handleSendMessage"
      @continue-generate="chatInputRef?.continueGeneration()"
    />
    <ChatInput ref="chatInputRef" />
  </div>
</template>
