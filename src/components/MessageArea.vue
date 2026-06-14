<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '@/stores/chat'
import { useAppStore } from '@/stores/app'
import { requestChatStream } from '@/utils'
import MarkdownContent from './MarkdownContent.vue'
import Modal from './Modal.vue'

const props = defineProps({
  showRenameModal: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['closeRenameModal', 'sendMessage'])

const chatStore = useChatStore()
const appStore = useAppStore()
// 虚拟列表引用，用于滚动到底部
const scrollerRef = ref(null)
// 只有用户停留在底部附近时才自动滚动；避免流式输出时“抢滚动条”
const shouldAutoScroll = ref(true)
const AUTO_SCROLL_THRESHOLD_PX = 120

// 编辑消息相关
const isEditModalOpen = ref(false)
const editingMessageIndex = ref(null)
const editingContent = ref('')

// 重命名对话相关
const isRenameModalOpen = ref(false)
const newChatTitle = ref('')

// 仅用于“重新回答”按钮的 loading 状态
const isGenerating = ref(false)

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 'ABORT_ERR' ||
    /aborted|abort/i.test(String(err?.message || ''))
  )
}

// 删除模态框相关
const isDeleteModalOpen = ref(false)
const deletingTurnIndex = ref(null)
const deletingTurnType = ref(null) // 'user' or 'assistant'

// 监听外部传入的 showRenameModal 属性
watch(
  () => props.showRenameModal,
  (newValue) => {
    if (newValue) {
      openRenameModal()
    }
  }
)

const isEmpty = computed(() => chatStore.currentMessages.length === 0)
const userName = '下雨天'

// 为虚拟列表提供带唯一 id 的消息数据
const virtualMessages = computed(() =>
  chatStore.currentMessages.map((m, index) => ({
    ...m,
    id: m.id || `${chatStore.currentChatId || 'chat'}-${index}`,
  }))
)

// 快捷提问建议（常用高频场景）
const suggestions = [
  { label: '生成一份工作总结', icon: 'lucide:check-square', iconClass: 'text-emerald-400' },
  { label: '帮我生成一首诗歌', icon: 'lucide:pen-line', iconClass: 'text-sky-400' },
  { label: '生成一段简单的Javascript代码', icon: 'lucide:code-2', iconClass: 'text-violet-400' },
  { label: '帮我生成一份寒假学习计划', icon: 'lucide:book-open', iconClass: 'text-amber-400' },
  { label: '生成一份邮件', icon: 'lucide:mail', iconClass: 'text-rose-400' },
]

// 定义事件来通知父组件发送消息
/**
 * 点击快捷提问建议时，将文案作为消息发送
 */
function onSuggest(s) {
  emit('sendMessage', s.label)
}

let scrollRafId = null;

/** 执行滚动到底部的 DOM 操作（不检查 shouldAutoScroll） */
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

/** 仅在用户位于底部附近时滚动，用于流式输出时的自动跟随 */
function scrollToBottom() {
  nextTick(() => {
    if (!shouldAutoScroll.value) return
    scrollToBottomForce()
  })
}

/** 进入对话时滚动到底部：刷新页面或切换对话后调用 */
function scrollToBottomOnEnter() {
  shouldAutoScroll.value = true
  nextTick(() => {
    scrollToBottomForce()
    // 虚拟列表可能稍晚才完成测量，再补一帧
    requestAnimationFrame(() => scrollToBottomForce())
  })
}

function isNearBottom(el, thresholdPx = AUTO_SCROLL_THRESHOLD_PX) {
  if (!el) return true
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  return distance <= thresholdPx
}

/**
 * 监听滚动事件：
 * - 用户在底部附近：继续自动跟随新消息
 * - 用户上滑查看历史：暂停自动滚动
 */
function onScrollerScroll(e) {
  // vue-virtual-scroller 的 scroll 事件有时会包一层 { event }
  const el = e?.target || e?.event?.target
  shouldAutoScroll.value = isNearBottom(el)
}

// 绑定真实 DOM 的 scroll 事件（DynamicScroller 不 emit `scroll`，用 @scroll 会触发 Vue 告警）
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

/**
 * 将指定文本复制到剪贴板
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (_) {}
}

/**
 * 从消息中提取用户输入的纯文本
 */
function getUserText(message) {
  const c = message?.content
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') {
    if (typeof c.text === 'string') return c.text
  }
  return ''
}

/**
 * 从消息中提取关联的图片列表（用于预览）
 */
function getUserImages(message) {
  const c = message?.content
  if (c && Array.isArray(c.images)) return c.images
  return []
}

// 图片预览
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

/**
 * 由用户消息触发删除：记录下标并打开删除确认模态框
 */
function deleteTurnFromUser(index) {
  if (!chatStore.currentChatId) return
  deletingTurnIndex.value = index
  deletingTurnType.value = 'user'
  isDeleteModalOpen.value = true
}

/**
 * 由 AI 消息触发删除：记录下标并打开删除确认模态框
 */
function deleteTurnFromAssistant(index) {
  if (!chatStore.currentChatId) return
  deletingTurnIndex.value = index
  deletingTurnType.value = 'assistant'
  isDeleteModalOpen.value = true
}

/**
 * 确认删除：根据之前记录的下标与类型，删除对应一轮对话
 */
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

/** 关闭删除确认模态框并重置状态 */
function closeDeleteModal() {
  isDeleteModalOpen.value = false
  deletingTurnIndex.value = null
  deletingTurnType.value = null
}

/**
 * 重新生成某条 AI 回复：
 * - 找到其前一条用户消息
 * - 使用当前模型重新请求并覆盖最后一条助手消息
 */
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
        onError: (msg) => chatStore.setLastAssistantMessage(`错误：${msg}`),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      console.error('API 调用失败:', error)
      chatStore.setLastAssistantMessage(`错误：${error.message}`)
    } finally {
      isGenerating.value = false
    }
}

/** 打开编辑提示词模态框，并填充当前内容 */
function openEditModal(index, content) {
  editingMessageIndex.value = index
  editingContent.value = content
  isEditModalOpen.value = true
}

/** 关闭编辑提示词模态框并重置状态 */
function closeEditModal() {
  isEditModalOpen.value = false
  editingMessageIndex.value = null
  editingContent.value = ''
}

/**
 * 保存编辑后的用户消息内容，并更新会话标题（如果是第一条）
 */
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

/** 打开重命名对话模态框，并预填当前标题 */
function openRenameModal() {
  if (chatStore.currentChat) {
    newChatTitle.value = chatStore.currentChat.title
    isRenameModalOpen.value = true
  }
}

/** 关闭重命名对话模态框并清空输入 */
function closeRenameModal() {
  isRenameModalOpen.value = false
  newChatTitle.value = ''
  emit('closeRenameModal')
}

/** 保存对话新标题到 store */
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

watch(
  () => virtualMessages.value.length,
  () => scrollToBottom(),
  { flush: 'post' }
)
// 只监听最后一条消息（极大地提升流式输出时的性能）
watch(
  () => {
    const msgs = virtualMessages.value;
    return msgs.length ? msgs[msgs.length - 1].content : '';
  },
  () => scrollToBottom(),
  { flush: 'post' }
)

// 刷新页面或切换对话时，始终滚动到底部
onMounted(() => {
  if (chatStore.currentMessages.length) {
    scrollToBottomOnEnter()
  }
  nextTick(() => bindScrollerDomScroll())
})
watch(
  () => chatStore.currentChatId,
  () => {
    if (chatStore.currentMessages.length) {
      scrollToBottomOnEnter()
    }
    nextTick(() => bindScrollerDomScroll())
  }
)

onUnmounted(() => {
  if (boundScrollEl) {
    boundScrollEl.removeEventListener('scroll', onScrollerScroll)
    boundScrollEl = null
  }
})
</script>

<template>
  <div class="relative flex flex-1 flex-col overflow-hidden">
    <template v-if="isEmpty">
      <div class="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div class="flex flex-col items-center gap-5 text-center">
          <div class="flex items-center gap-2">
            <span class="text-2xl font-medium text-text-primary">{{ userName }}, 你好</span>
            <span class="inline-flex h-7 w-7 items-center justify-center">
              <span class="flex gap-0.5">
                <span class="h-1.5 w-1.5 rounded-sm bg-blue-400" />
                <span class="h-1.5 w-1.5 rounded-sm bg-emerald-400" />
                <span class="h-1.5 w-1.5 rounded-sm bg-amber-400" />
                <span class="h-1.5 w-1.5 rounded-sm bg-rose-400" />
              </span>
            </span>
          </div>
          <p class="text-base text-text-secondary">需要我为你做些什么?</p>
        </div>
        <!-- 快捷提问 -->
        <div class="mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
          <button v-for="s in suggestions" :key="s.label" type="button"
            class="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:bg-primary-muted hover:text-primary"
            @click="onSuggest(s)">
            <Icon :icon="s.icon" class="h-4 w-4 shrink-0" :class="s.iconClass" />
            <span>{{ s.label }}</span>
          </button>
        </div>
      </div>
    </template>
    <template v-else>
      <DynamicScroller
        ref="scrollerRef"
        class="flex-1 overflow-y-auto px-4 py-6 no-scrollbar"
        :items="virtualMessages"
        :min-item-size="50"
        key-field="id"
        style="overflow-anchor: none;"
      >
        <!-- vue-virtual-scroller 会在插槽参数里传入 active，必须转给 DynamicScrollerItem -->
        <template #default="{ item, index, active }">
          <DynamicScrollerItem :item="item" :index="index" :active="active">
            <div class="mx-auto max-w-3xl group/message w-full mb-4"
              :class="item.role === 'user' ? 'flex justify-end' : ''">
              <!-- 用户消息 -->
              <div v-if="item.role === 'user'" class="flex items-start gap-2 max-w-[85%]">
                <!-- 用户消息：左侧操作栏 -->
                <div
                  class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
                  <button type="button"
                    class="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                    v-tooltip="'复制'"
                    @click="copyToClipboard(getUserText(item))">
                    <Icon icon="lucide:copy" class="h-4 w-4" />
                  </button>
                  <button type="button"
                    class="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                    v-tooltip="'编辑提示词'"
                    @click="openEditModal(index, getUserText(item))">
                    <Icon icon="lucide:edit-2" class="h-4 w-4" />
                  </button>
                  <button type="button" class="rounded p-1.5 text-text-muted hover:bg-red-500/20 hover:text-red-400"
                    v-tooltip="'删除此轮对话'" @click="deleteTurnFromUser(index)">
                    <Icon icon="lucide:trash-2" class="h-4 w-4" />
                  </button>
                </div>
                <!-- 用户消息气泡 -->
                <div class="rounded-2xl bg-primary text-white px-4 py-2.5 max-w-full">
                  <!-- 图片预览 -->
                  <div
                    v-if="getUserImages(item).length"
                    class="mb-2 flex flex-wrap gap-2"
                  >
                    <div
                      v-for="img in getUserImages(item)"
                      :key="img.id || img.url"
                      class="relative h-20 w-28 overflow-hidden rounded-md border border-white/20 bg-black/10 cursor-zoom-in"
                      @click="openImagePreview(img)"
                    >
                      <img
                        :src="img.url"
                        :alt="img.name || '已上传图片'"
                        class="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  <!-- 文本内容 -->
                  <p
                    v-if="getUserText(item)"
                    class="whitespace-pre-wrap break-words text-sm"
                  >
                    {{ getUserText(item) }}
                  </p>
                  <p
                    v-else-if="getUserImages(item).length"
                    class="text-xs text-white/80"
                  >
                    已发送 {{ getUserImages(item).length }} 张图片
                  </p>
                </div>
              </div>

              <!-- AI 消息 -->
              <div v-else class="max-w-[85%]">
                <div class="flex items-start gap-2">
                  <!-- AI 头像 -->
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                    <Icon icon="lucide:sparkles" class="h-4 w-4 text-primary" />
                  </div>
                  <!-- AI 消息气泡 -->
                  <div class="rounded-2xl bg-surface-elevated text-text-primary px-4 py-2.5 flex-1">
                    <div v-if="item.content && item.content.trim().length">
                      <MarkdownContent :content="item.content" />
                    </div>
                    <!-- AI 正在思考中的 loading 动效 -->
                    <div v-else class="flex items-center gap-2 text-sm text-text-muted">
                      <span
                        class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                      <span>AI 正在思考…</span>
                    </div>
                  </div>
                </div>
                <!-- AI 消息：底部操作栏 -->
                <div class="flex justify-end gap-0.5 mt-1 opacity-0 transition-opacity group-hover/message:opacity-100">
                  <button type="button"
                    class="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                    v-tooltip="'复制'"
                    @click="copyToClipboard(item.content)">
                    <Icon icon="lucide:copy" class="h-4 w-4" />
                  </button>
                  <button type="button"
                    class="rounded p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50 disabled:pointer-events-none"
                    v-tooltip="'重新回答'" @click="regenerate(index)" :disabled="isGenerating">
                    <Icon v-if="!isGenerating" icon="lucide:refresh-cw" class="h-4 w-4" />
                    <span v-else
                      class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
                  </button>
                  <button type="button" class="rounded p-1.5 text-text-muted hover:bg-red-500/20 hover:text-red-400"
                    v-tooltip="'删除此轮对话'" @click="deleteTurnFromAssistant(index)">
                    <Icon icon="lucide:trash-2" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </DynamicScrollerItem>
        </template>
      </DynamicScroller>

      <!-- 一键滚动到底部：用户上滑查看历史时显示 -->
      <Transition name="fade">
        <button
          v-if="!isEmpty && !shouldAutoScroll"
          type="button"
          class="absolute bottom-6 right-8 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary shadow-lg transition-colors hover:bg-surface-input hover:text-text-primary"
          aria-label="滚动到最新"
          v-tooltip="'滚动到最新'"
          @click="scrollToBottomOnEnter"
        >
          <Icon icon="lucide:chevron-down" class="h-5 w-5" />
        </button>
      </Transition>
    </template>

    <!-- 编辑消息模态框 -->
    <Modal :show="isEditModalOpen" title="编辑提示词" confirm-text="保存" @close="closeEditModal" @confirm="saveEditedMessage">
      <textarea v-model="editingContent"
        class="min-h-[100px] w-full resize-none rounded-lg border border-border bg-surface-input px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="请输入新的提示词..."></textarea>
    </Modal>

    <!-- 重命名对话模态框 -->
    <Modal :show="isRenameModalOpen" title="重命名此对话" confirm-text="重命名" @close="closeRenameModal"
      @confirm="saveChatTitle">
      <input v-model="newChatTitle" type="text"
        class="w-full rounded-lg border border-border bg-surface-input px-4 py-3 text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="请输入对话标题..." maxlength="50" />
    </Modal>

    <!-- 删除对话模态框 -->
    <Modal
      :show="isDeleteModalOpen"
      title="要删除这一轮对话吗？"
      confirm-text="删除"
      cancel-text="取消"
      confirm-variant="danger"
      @close="closeDeleteModal"
      @confirm="confirmDelete"
    >
      <p class="text-text-secondary">此操作将删除这一轮对话的提示和回答。</p>
    </Modal>

    <!-- 图片全屏预览层 -->
    <div
      v-if="isImagePreviewOpen && previewImage"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
    >
      <!-- 点击遮罩关闭 -->
      <div class="absolute inset-0" @click="closeImagePreview"></div>

      <!-- 关闭按钮 -->
      <button
        type="button"
        class="absolute right-6 top-6 rounded-full bg-black/60 p-2 text-white hover:bg-black/60"
        aria-label="关闭预览"
        @click="closeImagePreview"
      >
        <Icon icon="lucide:x" class="h-6 w-6" />
      </button>

      <!-- 大图 -->
      <img
        :src="previewImage.url"
        :alt="previewImage.name || '图片预览'"
        class="relative max-h-[80vh] max-w-[80vw] rounded-lg shadow-2xl"
      />
    </div>
  </div>
</template>
