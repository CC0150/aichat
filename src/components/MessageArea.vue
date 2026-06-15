<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '@/stores/chat'
import { useAppStore } from '@/stores/app'
import { requestChatStream } from '@/utils'
import MarkdownContent from './MarkdownContent.vue'
import Modal from './Modal.vue'

const props = defineProps({
  showRenameModal: { type: Boolean, default: false }
})

const emit = defineEmits(['closeRenameModal', 'sendMessage'])

const chatStore = useChatStore()
const appStore = useAppStore()

const scrollerRef = ref(null)
const shouldAutoScroll = ref(true)
const AUTO_SCROLL_THRESHOLD_PX = 120

const isEditModalOpen = ref(false)
const editingMessageIndex = ref(null)
const editingContent = ref('')

const isRenameModalOpen = ref(false)
const newChatTitle = ref('')

const isGenerating = ref(false)

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 'ABORT_ERR' ||
    /aborted|abort/i.test(String(err?.message || ''))
  )
}

const isDeleteModalOpen = ref(false)
const deletingTurnIndex = ref(null)
const deletingTurnType = ref(null)

watch(() => props.showRenameModal, (newValue) => {
  if (newValue) openRenameModal()
})

const isEmpty = computed(() => chatStore.currentMessages.length === 0)
const userName = '下雨天'

const virtualMessages = computed(() =>
  chatStore.currentMessages.map((m, index) => ({
    ...m,
    id: m.id || `${chatStore.currentChatId || 'chat'}-${index}`,
  }))
)

const suggestions = [
  { label: '写一份周报', icon: 'lucide:align-left', color: 'text-indigo-500', bg: 'bg-indigo-500/8' },
  { label: '解释一个概念', icon: 'lucide:lightbulb', color: 'text-sky-500', bg: 'bg-sky-500/8' },
  { label: '写一段代码', icon: 'lucide:braces', color: 'text-violet-500', bg: 'bg-violet-500/8' },
  { label: '起草一封邮件', icon: 'lucide:mail', color: 'text-emerald-500', bg: 'bg-emerald-500/8' },
]

function onSuggest(s) {
  emit('sendMessage', s.label)
}

let scrollRafId = null

function scrollToBottomForce() {
  if (scrollRafId) cancelAnimationFrame(scrollRafId)
  scrollRafId = requestAnimationFrame(() => {
    const scroller = scrollerRef.value
    if (scroller?.$el) {
      const el = scroller.$el
      el.scrollTop = el.scrollHeight
    }
  })
}

function scrollToBottom() {
  nextTick(() => {
    if (!shouldAutoScroll.value) return
    scrollToBottomForce()
  })
}

function scrollToBottomOnEnter() {
  shouldAutoScroll.value = true
  nextTick(() => {
    scrollToBottomForce()
    requestAnimationFrame(() => scrollToBottomForce())
  })
}

function isNearBottom(el, thresholdPx = AUTO_SCROLL_THRESHOLD_PX) {
  if (!el) return true
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  return distance <= thresholdPx
}

function onScrollerScroll(e) {
  const el = e?.target || e?.event?.target
  shouldAutoScroll.value = isNearBottom(el)
}

let boundScrollEl = null
function bindScrollerDomScroll() {
  const el = scrollerRef.value?.$el
  if (!el) return
  if (boundScrollEl && boundScrollEl !== el) {
    boundScrollEl.removeEventListener('scroll', onScrollerScroll)
    boundScrollEl = null
  }
  if (!boundScrollEl) {
    boundScrollEl = el
    boundScrollEl.addEventListener('scroll', onScrollerScroll, { passive: true })
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (_) {}
}

function getUserText(message) {
  const c = message?.content
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') {
    if (typeof c.text === 'string') return c.text
  }
  return ''
}

function getUserImages(message) {
  const c = message?.content
  if (c && Array.isArray(c.images)) return c.images
  return []
}

const isImagePreviewOpen = ref(false)
const previewImage = ref(null)

function openImagePreview(img) {
  previewImage.value = img
  isImagePreviewOpen.value = true
}

function closeImagePreview() {
  isImagePreviewOpen.value = false
  previewImage.value = null
}

function deleteTurnFromUser(index) {
  if (!chatStore.currentChatId) return
  deletingTurnIndex.value = index
  deletingTurnType.value = 'user'
  isDeleteModalOpen.value = true
}

function deleteTurnFromAssistant(index) {
  if (!chatStore.currentChatId) return
  deletingTurnIndex.value = index
  deletingTurnType.value = 'assistant'
  isDeleteModalOpen.value = true
}

function confirmDelete() {
  if (!chatStore.currentChatId || deletingTurnIndex.value === null) {
    closeDeleteModal()
    return
  }
  if (deletingTurnType.value === 'user') {
    chatStore.deleteTurnByUserIndex(chatStore.currentChatId, deletingTurnIndex.value)
  } else if (deletingTurnType.value === 'assistant') {
    chatStore.deleteTurnByAssistantIndex(chatStore.currentChatId, deletingTurnIndex.value)
  }
  closeDeleteModal()
}

function closeDeleteModal() {
  isDeleteModalOpen.value = false
  deletingTurnIndex.value = null
  deletingTurnType.value = null
}

async function regenerate(index) {
  if (!chatStore.currentChatId || isGenerating.value) return
  const userMessageIndex = index - 1
  if (userMessageIndex < 0) return
  const userMessage = chatStore.currentMessages[userMessageIndex]
  if (!userMessage || userMessage.role !== 'user') return

  const controller = new AbortController()
  try {
    isGenerating.value = true
    const modelConfig = appStore.currentModel
    chatStore.setLastAssistantMessage('')

    await requestChatStream({
      model: modelConfig.model,
      messages: [{
        role: 'user',
        content: typeof userMessage.content === 'string'
          ? userMessage.content
          : (userMessage.content?.text ?? ''),
      }],
      onChunk: (content) => chatStore.appendToLastMessage(content),
      onError: (msg) => chatStore.setLastAssistantMessage(`Error: ${msg}`),
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) return
    console.error('API error:', error)
    chatStore.setLastAssistantMessage(`Error: ${error.message}`)
  } finally {
    isGenerating.value = false
  }
}

function openEditModal(index, content) {
  editingMessageIndex.value = index
  editingContent.value = content
  isEditModalOpen.value = true
}

function closeEditModal() {
  isEditModalOpen.value = false
  editingMessageIndex.value = null
  editingContent.value = ''
}

function saveEditedMessage() {
  if (editingMessageIndex.value === null || !chatStore.currentChatId) {
    closeEditModal()
    return
  }
  const trimmedContent = editingContent.value.trim()
  if (!trimmedContent) {
    closeEditModal()
    return
  }
  chatStore.updateMessage(chatStore.currentChatId, editingMessageIndex.value, trimmedContent)
  closeEditModal()
}

function openRenameModal() {
  if (chatStore.currentChat) {
    newChatTitle.value = chatStore.currentChat.title
    isRenameModalOpen.value = true
  }
}

function closeRenameModal() {
  isRenameModalOpen.value = false
  newChatTitle.value = ''
  emit('closeRenameModal')
}

function saveChatTitle() {
  if (!chatStore.currentChatId) {
    closeRenameModal()
    return
  }
  const trimmedTitle = newChatTitle.value.trim()
  if (!trimmedTitle) {
    closeRenameModal()
    return
  }
  chatStore.renameChat(chatStore.currentChatId, trimmedTitle)
  closeRenameModal()
}

watch(() => virtualMessages.value.length, () => scrollToBottom(), { flush: 'post' })
watch(() => {
  const msgs = virtualMessages.value
  return msgs.length ? msgs[msgs.length - 1].content : ''
}, () => scrollToBottom(), { flush: 'post' })

onMounted(() => {
  if (chatStore.currentMessages.length) {
    scrollToBottomOnEnter()
  }
  nextTick(() => bindScrollerDomScroll())
})
watch(() => chatStore.currentChatId, () => {
  if (chatStore.currentMessages.length) {
    scrollToBottomOnEnter()
  }
  nextTick(() => bindScrollerDomScroll())
})

onUnmounted(() => {
  if (boundScrollEl) {
    boundScrollEl.removeEventListener('scroll', onScrollerScroll)
    boundScrollEl = null
  }
})
</script>

<template>
  <div class="relative flex flex-1 flex-col overflow-hidden">
    <!-- ===== Empty State ===== -->
    <template v-if="isEmpty">
      <div class="flex flex-1 flex-col items-center justify-center px-4">
        <!-- Greeting -->
        <div class="text-center">
          <h2 class="text-[28px] font-semibold tracking-tight text-text-primary leading-tight">
            {{ userName }}，你好
          </h2>
          <p class="mt-3 text-[15px] text-text-muted leading-relaxed">
            今天想聊什么？
          </p>
        </div>

        <!-- Thin accent divider -->
        <div class="mt-8 h-px w-12 rounded-full bg-primary/40" />

        <!-- Suggestion pills -->
        <div class="mt-8 flex max-w-lg flex-wrap justify-center gap-3">
          <button
            v-for="(s, i) in suggestions"
            :key="s.label"
            type="button"
            class="group flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-300"
            :class="[s.bg, s.color]"
            :style="{ animationDelay: `${i * 80}ms` }"
            @click="onSuggest(s)"
          >
            <Icon
              :icon="s.icon"
              class="h-[18px] w-[18px] shrink-0 opacity-70 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110"
            />
            <span class="opacity-80 transition-opacity duration-300 group-hover:opacity-100">{{ s.label }}</span>
            <Icon
              icon="lucide:arrow-right"
              class="h-3.5 w-3.5 shrink-0 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-60 group-hover:translate-x-0"
            />
          </button>
        </div>
      </div>
    </template>

    <!-- ===== Messages ===== -->
    <template v-else>
      <DynamicScroller
        ref="scrollerRef"
        class="flex-1 overflow-y-auto px-4 py-6 no-scrollbar"
        :items="virtualMessages"
        :min-item-size="50"
        key-field="id"
        style="overflow-anchor: none;"
      >
        <template #default="{ item, index, active }">
          <DynamicScrollerItem :item="item" :index="index" :active="active">
            <div
              class="mx-auto max-w-3xl group/message mb-5"
              :class="item.role === 'user' ? 'flex justify-end' : ''"
            >
              <!-- User message -->
              <div v-if="item.role === 'user'" class="flex items-start gap-2 max-w-[85%]">
                <!-- Action buttons (left side) -->
                <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100">
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                    v-tooltip="'复制'"
                    @click="copyToClipboard(getUserText(item))"
                  >
                    <Icon icon="lucide:copy" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                    v-tooltip="'编辑提示词'"
                    @click="openEditModal(index, getUserText(item))"
                  >
                    <Icon icon="lucide:edit-2" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                    v-tooltip="'删除此轮对话'"
                    @click="deleteTurnFromUser(index)"
                  >
                    <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- Bubble -->
                <div class="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 shadow-sm max-w-full">
                  <div v-if="getUserImages(item).length" class="mb-2 flex flex-wrap gap-2">
                    <div
                      v-for="img in getUserImages(item)"
                      :key="img.id || img.url"
                      class="relative h-20 w-28 overflow-hidden rounded-lg border border-white/20 bg-black/10 cursor-zoom-in transition-transform duration-200 hover:scale-[1.02]"
                      @click="openImagePreview(img)"
                    >
                      <img :src="img.url" :alt="img.name || 'Image'" class="h-full w-full object-cover" />
                    </div>
                  </div>
                  <p v-if="getUserText(item)" class="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">
                    {{ getUserText(item) }}
                  </p>
                  <p v-else-if="getUserImages(item).length" class="text-xs text-white/80">
                    已发送 {{ getUserImages(item).length }} 张图片
                  </p>
                </div>

                <!-- User avatar -->
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted ring-1 ring-primary-muted">
                  <Icon icon="lucide:circle-user" class="h-[15px] w-[15px] text-primary" />
                </div>
              </div>

              <!-- AI message -->
              <div v-else class="max-w-[85%]">
                <div class="flex items-start gap-3">
                  <!-- AI avatar -->
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted ring-1 ring-primary-muted">
                    <Icon icon="lucide:bot" class="h-[15px] w-[15px] text-primary" />
                  </div>

                  <!-- AI bubble -->
                  <div class="rounded-2xl rounded-bl-md bg-surface-elevated px-4 py-3 shadow-sm ring-1 ring-border flex-1">
                    <div v-if="item.content && item.content.trim().length">
                      <MarkdownContent :content="item.content" />
                    </div>
                    <!-- Thinking state -->
                    <div v-else class="flex items-center gap-2 py-1 text-sm text-text-muted">
                      <span class="flex gap-1">
                        <span class="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 0ms" />
                        <span class="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 150ms" />
                        <span class="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 300ms" />
                      </span>
                      <span class="text-xs">AI 正在思考…</span>
                    </div>
                  </div>
                </div>

                <!-- AI action buttons -->
                <div class="flex justify-end gap-0.5 mt-1.5 ml-11 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100">
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                    v-tooltip="'复制'"
                    @click="copyToClipboard(item.content)"
                  >
                    <Icon icon="lucide:copy" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none"
                    v-tooltip="'重新回答'"
                    @click="regenerate(index)"
                    :disabled="isGenerating"
                  >
                    <Icon v-if="!isGenerating" icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
                    <span v-else class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  </button>
                  <button
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                    v-tooltip="'删除此轮对话'"
                    @click="deleteTurnFromAssistant(index)"
                  >
                    <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>

      <!-- Scroll to bottom -->
      <Transition name="fade">
        <button
          v-if="!isEmpty && !shouldAutoScroll"
          type="button"
          class="absolute bottom-6 right-8 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary shadow-lg transition-all duration-200 hover:bg-surface-input hover:text-text-primary hover:shadow-xl hover:scale-105"
          aria-label="滚动到最新"
          v-tooltip="'滚动到最新'"
          @click="scrollToBottomOnEnter"
        >
          <Icon icon="lucide:chevron-down" class="h-5 w-5" />
        </button>
      </Transition>
    </template>

    <!-- Edit modal -->
    <Modal :show="isEditModalOpen" title="编辑提示词" confirm-text="保存" @close="closeEditModal" @confirm="saveEditedMessage">
      <textarea
        v-model="editingContent"
        class="min-h-[100px] w-full resize-none rounded-lg border border-border bg-surface-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors duration-200"
        placeholder="请输入新的提示词..."
      />
    </Modal>

    <!-- Rename modal -->
    <Modal :show="isRenameModalOpen" title="重命名此对话" confirm-text="重命名" @close="closeRenameModal" @confirm="saveChatTitle">
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
      title="要删除这一轮对话吗？"
      confirm-text="删除"
      cancel-text="取消"
      confirm-variant="danger"
      @close="closeDeleteModal"
      @confirm="confirmDelete"
    >
      <p class="text-sm text-text-secondary">此操作将删除这一轮对话的提示和回答。</p>
    </Modal>

    <!-- Image preview overlay -->
    <div
      v-if="isImagePreviewOpen && previewImage"
      class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm"
    >
      <div class="absolute inset-0" @click="closeImagePreview" />
      <button
        type="button"
        class="absolute right-6 top-6 rounded-full bg-slate-900/60 p-2 text-white/80 transition-colors hover:bg-slate-900 hover:text-white"
        aria-label="关闭预览"
        @click="closeImagePreview"
      >
        <Icon icon="lucide:x" class="h-5 w-5" />
      </button>
      <img
        :src="previewImage.url"
        :alt="previewImage.name || 'Preview'"
        class="relative max-h-[85vh] max-w-[85vw] rounded-xl shadow-2xl"
      />
    </div>
  </div>
</template>
