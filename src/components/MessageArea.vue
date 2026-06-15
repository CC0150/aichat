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

const emit = defineEmits(['closeRenameModal', 'sendMessage', 'continueGenerate'])

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

const virtualMessages = computed(() =>
  chatStore.currentMessages.map((m, index) => ({
    ...m,
    id: m.id || `${chatStore.currentChatId || 'chat'}-${index}`,
  }))
)

const suggestions = [
  { label: '解释 JavaScript 闭包原理', icon: 'lucide:box' },
  { label: '手写一个防抖 debounce 函数', icon: 'lucide:code-2' },
  { label: 'Vue 3 响应式原理是什么', icon: 'lucide:layers' },
  { label: '前端性能优化有哪些方法', icon: 'lucide:zap' },
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
      <div class="relative flex flex-1 flex-col items-center justify-center px-6">

        <!-- Ambient atmosphere -->
        <div class="absolute inset-0 pointer-events-none">
          <div class="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-500/[0.04] blur-3xl animate-breath" />
          <div class="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-violet-500/[0.03] blur-3xl animate-breath" style="animation-delay: -4s" />
        </div>

        <!-- Content -->
        <div class="relative w-full max-w-lg">

          <!-- Headline group -->
          <div class="mb-6">
            <div class="flex items-center gap-2 mb-2">
              <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-muted/80 backdrop-blur-sm ring-1 ring-primary/10">
                <svg width="14" height="14" viewBox="0 0 40 40" fill="none">
                  <rect x="3" y="3" width="34" height="34" rx="8.5" class="fill-primary" />
                  <path d="M20 9L22 18L31 20L22 22L20 31L18 22L9 20L18 18Z" class="fill-primary-muted" />
                </svg>
              </div>
              <span class="text-[11px] font-medium text-text-muted tracking-widest uppercase">AI Assistant for Frontend</span>
            </div>
            <h2 class="text-2xl font-semibold tracking-tight text-text-primary leading-[1.25]">
              你好<span class="text-text-muted">，随时提问</span>
            </h2>
            <p class="mt-1.5 text-sm text-text-muted/70">
              随时解答前端技术问题，模拟真实面试场景
            </p>
          </div>

          <!-- Suggestion grid — 2 cols x 2 rows -->
          <div class="grid grid-cols-2 gap-2.5">
            <button
              v-for="(s, i) in suggestions"
              :key="s.label"
              type="button"
              class="suggestion-card group relative w-full rounded-xl border border-border/50 bg-surface-elevated/60 backdrop-blur-sm px-3.5 py-3 text-left transition-all duration-500 hover:bg-surface-elevated hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
              :style="{ animationDelay: `${i * 70}ms` }"
              @click="onSuggest(s)"
            >
              <div class="flex items-center gap-2.5">
                <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-input/70 transition-colors duration-500 group-hover:bg-primary-muted/50">
                  <Icon :icon="s.icon" class="h-[14px] w-[14px] text-text-muted transition-colors duration-500 group-hover:text-primary" />
                </div>
                <span class="text-[13px] font-medium text-text-secondary transition-colors duration-500 group-hover:text-text-primary">
                  {{ s.label }}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== Messages ===== -->
    <template v-else>
      <DynamicScroller
        ref="scrollerRef"
        class="flex-1 overflow-y-auto px-2 sm:px-4 py-4 sm:py-6 no-scrollbar"
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
              <div v-if="item.role === 'user'" class="flex items-start gap-1.5 sm:gap-2 max-w-[92%] sm:max-w-[85%]">
                <!-- Action buttons (left, hidden on mobile) -->
                <div class="hidden sm:flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100">
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
                <div class="min-w-0 rounded-2xl rounded-br-md bg-primary px-3 sm:px-4 py-2 sm:py-2.5 shadow-sm">
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
                  <p v-if="getUserText(item)" class="whitespace-pre-wrap break-words text-[13px] sm:text-sm leading-relaxed text-white">
                    {{ getUserText(item) }}
                  </p>
                  <p v-else-if="getUserImages(item).length" class="text-xs text-white/80">
                    已发送 {{ getUserImages(item).length }} 张图片
                  </p>
                </div>

                <!-- User avatar -->
                <div class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted ring-1 ring-primary-muted">
                  <Icon icon="lucide:circle-user" class="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px] text-primary" />
                </div>
              </div>

              <!-- AI message -->
              <div v-else class="max-w-[92%] sm:max-w-[85%]">
                <div class="flex items-start gap-2 sm:gap-3">
                  <!-- AI avatar -->
                  <div class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted ring-1 ring-primary-muted">
                    <Icon icon="lucide:bot" class="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px] text-primary" />
                  </div>

                  <!-- AI bubble -->
                  <div class="min-w-0 rounded-2xl rounded-bl-md bg-surface-elevated px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm ring-1 ring-border">
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
                <div class="hidden sm:flex justify-end gap-0.5 mt-1.5 ml-11 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100">
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

                <!-- 继续生成按钮 -->
                <div
                  v-if="index === chatStore.currentMessages.length - 1 && chatStore.lastInterruptedChatId === chatStore.currentChatId"
                  class="mt-2 ml-11"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all duration-200 hover:bg-primary/10 hover:border-primary/50"
                    @click="emit('continueGenerate')"
                  >
                    <Icon icon="lucide:play" class="h-3.5 w-3.5" />
                    继续生成
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

<style scoped>
.thin-scrollbar::-webkit-scrollbar { width: 4px; }
.thin-scrollbar::-webkit-scrollbar-track { background: transparent; }
.thin-scrollbar::-webkit-scrollbar-thumb { background: transparent; border-radius: 2px; transition: background 0.3s; }
.thin-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); }
.thin-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.5); }
.thin-scrollbar { scrollbar-width: thin; scrollbar-color: transparent transparent; }

/* Ambient breathing gradient */
@keyframes breath {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}
.animate-breath {
  animation: breath 8s ease-in-out infinite;
}

/* Staggered entrance for suggestion cards */
@keyframes cardEnter {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.suggestion-card {
  animation: cardEnter 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

/* Frosted card inner highlight */
.suggestion-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 50%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s;
}
.suggestion-card:hover::before {
  opacity: 1;
}
</style>
