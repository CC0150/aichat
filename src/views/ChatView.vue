<script setup>
import { watch, ref } from 'vue'
import { useRoute } from 'vue-router'
import ChatHeader from '@/components/ChatHeader.vue'
import MessageArea from '@/components/MessageArea.vue'
import ChatInput from '@/components/ChatInput.vue'
import { useChatStore } from '@/stores/chat'

const route = useRoute()
const chatStore = useChatStore()
const chatInputRef = ref(null)

// 控制重命名模态框的显示
const showRenameModal = ref(false)

watch(
  () => route.params.id,
  (id) => {
    chatStore.setCurrentChat(id ?? null)
  },
  { immediate: true },
)

// 处理打开重命名模态框的事件
function handleOpenRenameModal() {
  showRenameModal.value = true
}

// 处理关闭重命名模态框的事件
function handleCloseRenameModal() {
  showRenameModal.value = false
}

// 处理快捷提问消息
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
