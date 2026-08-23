<script setup lang="ts">
// @ts-nocheck
import { ref, computed, shallowRef, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '@/stores/chat'
import { useAppStore } from '@/stores/app'
import { isAbortError } from '@/utils'
import { requestChatStream } from '@/utils'
import { requestRagStream } from '@/utils/ragApi'
import { useScrollStabilizer } from '@/composables/useVirtualScrollHeight'
import MarkdownContent from './MarkdownContent.vue'
import Modal from './Modal.vue'

const props = defineProps({
  showRenameModal: { type: Boolean, default: false },
})

const emit = defineEmits(['closeRenameModal', 'sendMessage', 'continueGenerate'])

const chatStore = useChatStore()
const appStore = useAppStore()

/** 虚拟滚动组件 DynamicScroller 的引用 */
const scrollerRef = ref<any>(null)
/** 是否应自动滚动到底部（用户在底部附近时自动跟随，手动上滑后暂停） */
const shouldAutoScroll = ref(true)
/** 判定"在底部附近"的阈值（px），在此范围内视为底部，继续自动滚动 */
const AUTO_SCROLL_THRESHOLD_PX = 120

/** 编辑消息弹窗是否可见 */
const isEditModalOpen = ref(false)
/** 正在编辑的消息在消息列表中的索引 */
const editingMessageIndex = ref<any>(null)
/** 编辑弹窗中的消息内容 */
const editingContent = ref('')

/** 重命名弹窗是否可见 */
const isRenameModalOpen = ref(false)
/** 重命名弹窗中的新标题 */
const newChatTitle = ref('')

/** 是否正在进行重新生成（本地状态） */
const isGenerating = ref(false)

/** 删除本轮对话确认弹窗是否可见 */
const isDeleteModalOpen = ref(false)
/** 待删除的消息索引 */
const deletingTurnIndex = ref<any>(null)
/** 待删除的消息类型：'user' 或 'assistant' */
const deletingTurnType = ref<any>(null)

watch(
  () => props.showRenameModal,
  (newValue) => {
    if (newValue) openRenameModal()
  },
)

const isEmpty = computed(() => chatStore.currentMessages.length === 0)

// shallowRef：数组引用只在结构变化（新增/删除/切会话）时替换
// 流式输出时内容变化通过 Pinia reactive 对象驱动模板局部重渲染，避免全量 spread
const virtualMessages = shallowRef([])

/** 确保消息有唯一 id（虚拟滚动需要 key-field），无 id 时用 chatId + index 生成 */
function ensureMessageId(msg, index) {
  if (!msg.id) {
    msg.id = `${chatStore.currentChatId || 'chat'}-${index}`
  }
  return msg
}

/** 将 chatStore.currentMessages 同步到 virtualMessages（触发 shallowRef 更新） */
function syncVirtualMessages() {
  virtualMessages.value = chatStore.currentMessages.map((m, i) => ensureMessageId(m, i))
}

syncVirtualMessages()

// 消息数量变化时重建虚拟列表数组（新增/删除消息）
watch(
  () => chatStore.currentMessages.length,
  () => syncVirtualMessages(),
)
// 切换到不同对话时重建虚拟列表数组（消息内容完全不同）
watch(
  () => chatStore.currentChatId,
  () => syncVirtualMessages(),
)

/** 建议问题列表（空状态时显示的快捷入口） */
const suggestions = [
  { label: 'Java 后端开发面试常见考点', icon: 'lucide:coffee' },
  { label: '产品经理面试中如何回答问题', icon: 'lucide:lightbulb' },
  { label: '模拟一次前端技术面试', icon: 'lucide:code-2' },
  { label: '数据分析岗位需要掌握哪些技能', icon: 'lucide:bar-chart-3' },
]

/** 点击建议卡片 → 以该建议文本作为消息发送 */
function onSuggest(s) {
  emit('sendMessage', s.label)
}

// ===== 虚拟滚动增强：双 RAF 稳定滚动 + 切对话首帧等待 =====
const {
  ready: scrollerReady,
  scrollToBottomStable,
  markReadyAfterFirstMeasure,
} = useScrollStabilizer(scrollerRef)

/**
 * 安全滚动到底部 —— 双 RAF 等 DynamicScroller 内部 ResizeObserver 完成测量，
 * 解决流式输出期间 scrollTo 和 ResizeObserver 的竞态抖动问题。
 */
function scrollToBottomForce() {
  scrollToBottomStable()
}

/** 自动滚动：仅在 shouldAutoScroll 为 true 时执行（用户手动上滑后暂停） */
function scrollToBottom() {
  nextTick(() => {
    if (!shouldAutoScroll.value) return
    scrollToBottomStable()
  })
}

/**
 * 进入对话时强制滚到底部
 * 先标记"等待首帧测量"，双 RAF 稳定后再滚
 */
function scrollToBottomOnEnter() {
  shouldAutoScroll.value = true
  markReadyAfterFirstMeasure()
  scrollToBottomStable()
}

/** 判断滚动容器是否在底部附近（阈值内视为"在底部"） */
function isNearBottom(el, thresholdPx = AUTO_SCROLL_THRESHOLD_PX) {
  if (!el) return true
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  return distance <= thresholdPx
}

/** 滚动节流标志：防止同一个 RAF 周期内重复执行滚动逻辑 */
let scrollTicking = false

/**
 * 滚动事件处理（RAF 节流）
 * 根据当前滚动位置判断是否应继续自动跟随
 */
function onScrollerScroll(e) {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    scrollTicking = false
    const el = e?.target || e?.event?.target
    shouldAutoScroll.value = isNearBottom(el)
  })
}

/** 已绑定滚动事件监听的 DOM 元素引用（用于切换对话时重新绑定） */
let boundScrollEl = null
/** 绑定虚拟滚动容器的滚动事件监听，处理动态 DOM 替换（RecycleScroller 可能重建 $el） */
function bindScrollerDomScroll() {
  const el = scrollerRef.value?.$el
  if (!el) return
  // 如果 scroller 的 DOM 元素已更换，先解绑旧的再绑定新的
  if (boundScrollEl && boundScrollEl !== el) {
    boundScrollEl.removeEventListener('scroll', onScrollerScroll)
    boundScrollEl = null
  }
  if (!boundScrollEl) {
    boundScrollEl = el
    boundScrollEl.addEventListener('scroll', onScrollerScroll, { passive: true })
  }
}

/** 复制文本到剪贴板（静默失败） */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (_: any) {}
}

/**
 * 从消息对象中提取纯文本内容
 * 支持 string 格式和 { text, attachments, images } 对象格式
 */
function getUserText(message) {
  const c = message?.content
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') {
    if (typeof c.text === 'string') return c.text
  }
  return ''
}

/** 从消息对象中提取图片数组 */
function getUserImages(message) {
  const c = message?.content
  if (c && Array.isArray(c.images)) return c.images
  return []
}

/** 图片全屏预览是否可见 */
const isImagePreviewOpen = ref(false)
/** 当前预览的图片对象 { url, name } */
const previewImage = ref<any>(null)

/** 打开图片全屏预览 */
function openImagePreview(img) {
  previewImage.value = img
  isImagePreviewOpen.value = true
}

/** 关闭图片全屏预览 */
function closeImagePreview() {
  isImagePreviewOpen.value = false
  previewImage.value = null
}

/** 删除从 user 消息开始的一整轮对话 */
function deleteTurnFromUser(index) {
  if (!chatStore.currentChatId) return
  deletingTurnIndex.value = index
  deletingTurnType.value = 'user'
  isDeleteModalOpen.value = true
}

/** 删除从 assistant 消息开始的一整轮对话 */
function deleteTurnFromAssistant(index) {
  if (!chatStore.currentChatId) return
  deletingTurnIndex.value = index
  deletingTurnType.value = 'assistant'
  isDeleteModalOpen.value = true
}

/** 确认删除本轮对话，根据类型调用对应的 store 方法 */
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

/** 关闭删除确认弹窗并重置状态 */
function closeDeleteModal() {
  isDeleteModalOpen.value = false
  deletingTurnIndex.value = null
  deletingTurnType.value = null
}

/**
 * 重新生成 AI 回复
 * @param {number} index - 当前 assistant 消息在消息列表中的索引
 * assistant 消息的前一条（index - 1）必须是 user 消息，用它重新请求
 */
async function regenerate(index) {
  if (!chatStore.currentChatId || isGenerating.value) return
  const userMessageIndex = index - 1
  if (userMessageIndex < 0) return
  const userMessage = chatStore.currentMessages[userMessageIndex]
  if (!userMessage || userMessage.role !== 'user') return

  const controller = new AbortController()
  // 注册到 store 以便 ChatInput 的停止按钮也能中止重新生成
  chatStore.setRegenerateAbort(controller)
  chatStore.isRegenerating = true
  try {
    isGenerating.value = true
    const modelConfig = appStore.currentModel
    // 清空当前 assistant 消息，准备接收新内容
    chatStore.setLastAssistantMessage('')

    // 提取用户消息的纯文本和可能的 kbId（KB 模式时会附带）
    const msgContent = userMessage.content
    const isObject = msgContent && typeof msgContent === 'object' && !Array.isArray(msgContent)
    const text =
      typeof msgContent === 'string' ? msgContent : isObject ? (msgContent.text ?? '') : ''
    const kbId = isObject ? msgContent.kbId : null

    if (kbId) {
      await requestRagStream({
        query: text,
        kbId,
        model: modelConfig.model,
        onChunk: (chunk: string) => chatStore.appendToLastMessage(chunk),
        onError: (msg: string) => chatStore.setLastAssistantMessage(`Error: ${msg}`),
        signal: controller.signal,
      })
    } else {
      await requestChatStream(modelConfig.model, [{ role: 'user', content: text }], {
        onChunk: (content: string) => chatStore.appendToLastMessage(content),
        onError: (msg: string) => chatStore.setLastAssistantMessage(`Error: ${msg}`),
        signal: controller.signal,
      })
    }
  } catch (error) {
    // 用户主动中止时不报错
    if (controller.signal.aborted || isAbortError(error)) return
    console.error('API error:', error)
    chatStore.setLastAssistantMessage(`Error: ${error.message}`)
  } finally {
    isGenerating.value = false
    chatStore.isRegenerating = false
    chatStore.setRegenerateAbort(null)
  }
}

/** 打开编辑用户消息的弹窗 */
function openEditModal(index, content) {
  editingMessageIndex.value = index
  editingContent.value = content
  isEditModalOpen.value = true
}

/** 关闭编辑弹窗并重置状态 */
function closeEditModal() {
  isEditModalOpen.value = false
  editingMessageIndex.value = null
  editingContent.value = ''
}

/** 保存编辑后的消息内容，空内容不保存 */
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

/** 打开重命名弹窗，预填当前对话标题 */
function openRenameModal() {
  if (chatStore.currentChat) {
    newChatTitle.value = chatStore.currentChat.title
    isRenameModalOpen.value = true
  }
}

/** 关闭重命名弹窗并通知父组件 */
function closeRenameModal() {
  isRenameModalOpen.value = false
  newChatTitle.value = ''
  emit('closeRenameModal')
}

/** 保存对话标题（去首尾空格，空标题不保存） */
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

// 消息数变化或最后一条消息内容更新时（含流式输出 chunk）自动滚动到底部
// flush: 'post' 确保在 DOM 更新后再执行滚动
watch(
  () => {
    const msgs = virtualMessages.value
    const len = msgs.length
    const lastContent = len ? msgs[len - 1].content : ''
    return { len, lastContent }
  },
  () => scrollToBottom(),
  { flush: 'post' },
)

onMounted(() => {
  if (chatStore.currentMessages.length) {
    scrollToBottomOnEnter()
  }
  nextTick(() => bindScrollerDomScroll())
})
// 切换对话时重新绑定滚动监听并滚到底部
watch(
  () => chatStore.currentChatId,
  () => {
    if (chatStore.currentMessages.length) {
      scrollToBottomOnEnter()
    }
    nextTick(() => bindScrollerDomScroll())
  },
)

// 组件卸载时解绑滚动事件监听，防止内存泄漏
onUnmounted(() => {
  if (boundScrollEl) {
    boundScrollEl.removeEventListener('scroll', onScrollerScroll)
    boundScrollEl = null
  }
})
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <!-- ===== Empty State ===== -->
    <template v-if="isEmpty">
      <div class="relative flex flex-1 flex-col items-center justify-center px-6">
        <!-- Ambient atmosphere -->
        <div class="absolute inset-0 pointer-events-none">
          <div
            class="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/[0.05] blur-3xl glow-breathe"
          />
          <div
            class="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-[#e8a766]/[0.04] blur-3xl glow-breathe"
            style="animation-delay: -4s"
          />
        </div>

        <!-- Content -->
        <div class="relative w-full max-w-lg">
          <!-- Headline group -->
          <div class="mb-8">
            <div class="flex items-center gap-2.5 mb-3">
              <div
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-muted/80 backdrop-blur-sm ring-1 ring-primary/10"
              >
                <svg width="14" height="14" viewBox="0 0 40 40" fill="none">
                  <rect x="3" y="3" width="34" height="34" rx="9" class="fill-primary" />
                  <rect x="9" y="12" width="5" height="16" rx="2.5" fill="white" />
                  <rect x="26" y="12" width="5" height="16" rx="2.5" fill="white" opacity="0.55" />
                  <path d="M14 18L24 15" stroke="white" stroke-width="2.5" stroke-linecap="round" />
                  <path d="M14 24L24 27" stroke="white" stroke-width="2.5" stroke-linecap="round" />
                  <circle cx="27" cy="10" r="3" class="fill-primary-muted" />
                </svg>
              </div>
              <span class="text-[11px] font-display italic text-text-muted tracking-[0.3em]"
                >AI 面试陪练室</span
              >
            </div>
            <h2
              class="font-display text-[26px] font-light tracking-[0.06em] leading-[1.35] text-text-primary"
            >
              你好<span class="text-primary">，</span>我是 Intervy
            </h2>
            <p class="mt-2 font-display text-sm italic text-text-muted/80">
              前端进阶 · 随时提问，模拟实战
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
                <div
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-input/70 transition-colors duration-500 group-hover:bg-primary-muted/50"
                >
                  <Icon
                    :icon="s.icon"
                    class="h-[14px] w-[14px] text-text-muted transition-colors duration-500 group-hover:text-primary"
                  />
                </div>
                <span
                  class="text-[13px] font-medium text-text-secondary transition-colors duration-500 group-hover:text-text-primary"
                >
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
        aria-live="polite"
        aria-label="对话内容"
        :items="virtualMessages"
        :min-item-size="120"
        key-field="id"
        style="overflow-anchor: none"
      >
        <template #default="{ item, index, active }">
          <DynamicScrollerItem :item="item" :index="index" :active="active">
            <div
              class="mx-auto max-w-3xl group/message mb-8"
              :class="item.role === 'user' ? 'flex justify-end' : ''"
            >
              <!-- User message -->
              <div
                v-if="item.role === 'user'"
                class="flex items-start gap-1.5 sm:gap-2 max-w-[92%] sm:max-w-[85%]"
              >
                <!-- Action buttons (left, hidden on mobile) -->
                <div
                  class="hidden sm:flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100"
                >
                  <button
                    v-tooltip="'复制'"
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                    aria-label="复制消息"
                    @click="copyToClipboard(getUserText(item))"
                  >
                    <Icon icon="lucide:copy" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    v-tooltip="'编辑提示词'"
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                    aria-label="编辑消息"
                    @click="openEditModal(index, getUserText(item))"
                  >
                    <Icon icon="lucide:edit-2" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    v-tooltip="'删除此轮对话'"
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                    aria-label="删除此轮对话"
                    @click="deleteTurnFromUser(index)"
                  >
                    <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- Bubble -->
                <div
                  class="min-w-0 rounded-2xl rounded-br-md bg-primary px-3 sm:px-4 py-2 sm:py-2.5 shadow-sm"
                >
                  <div v-if="getUserImages(item).length" class="mb-2 flex flex-wrap gap-2">
                    <div
                      v-for="img in getUserImages(item)"
                      :key="img.id || img.url"
                      class="relative h-20 w-28 overflow-hidden rounded-lg border border-white/20 bg-black/10 cursor-zoom-in transition-transform duration-200 hover:scale-[1.02]"
                      @click="openImagePreview(img)"
                    >
                      <img
                        :src="img.url"
                        :alt="img.name || 'Image'"
                        class="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  <p
                    v-if="getUserText(item)"
                    class="whitespace-pre-wrap break-words text-[13px] sm:text-sm leading-relaxed text-white"
                  >
                    {{ getUserText(item) }}
                  </p>
                  <p v-else-if="getUserImages(item).length" class="text-xs text-white/80">
                    已发送 {{ getUserImages(item).length }} 张图片
                  </p>
                </div>

                <!-- User avatar -->
                <div
                  class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted ring-1 ring-primary-muted"
                >
                  <Icon
                    icon="lucide:circle-user"
                    class="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px] text-primary"
                  />
                </div>
              </div>

              <!-- AI message -->
              <div v-else class="max-w-[92%] sm:max-w-[85%]">
                <div class="flex items-start gap-2 sm:gap-3">
                  <!-- AI avatar -->
                  <div
                    class="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-primary-muted ring-1 ring-primary-muted"
                  >
                    <Icon
                      icon="lucide:bot"
                      class="h-3.5 w-3.5 sm:h-[15px] sm:w-[15px] text-primary"
                    />
                  </div>

                  <!-- AI bubble -->
                  <div
                    class="min-w-0 rounded-2xl rounded-bl-md bg-surface-elevated px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm ring-1 ring-border"
                  >
                    <div v-if="item.content && item.content.trim().length">
                      <MarkdownContent :content="item.content" :visible="active" />
                    </div>
                    <!-- Thinking state -->
                    <div v-else class="flex items-center gap-2 py-1 text-sm text-text-muted">
                      <span class="flex gap-1.5">
                        <span
                          class="ink-dot h-1.5 w-1.5 rounded-full bg-primary"
                          style="animation-delay: 0ms"
                        />
                        <span
                          class="ink-dot h-1.5 w-1.5 rounded-full bg-primary"
                          style="animation-delay: 180ms"
                        />
                        <span
                          class="ink-dot h-1.5 w-1.5 rounded-full bg-primary"
                          style="animation-delay: 360ms"
                        />
                      </span>
                      <span class="font-display text-xs italic tracking-wide">AI 正在遣词……</span>
                    </div>
                  </div>
                </div>

                <!-- AI action buttons -->
                <div
                  class="hidden sm:flex justify-end gap-0.5 mt-1.5 ml-11 opacity-0 transition-opacity duration-200 group-hover/message:opacity-100"
                >
                  <button
                    v-tooltip="'复制'"
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                    aria-label="复制回复"
                    @click="copyToClipboard(item.content)"
                  >
                    <Icon icon="lucide:copy" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    v-tooltip="isGenerating ? '停止生成' : '重新回答'"
                    type="button"
                    class="rounded-md p-1.5 transition-colors duration-150"
                    :class="
                      isGenerating
                        ? 'text-red-500 hover:bg-red-500/10'
                        : 'text-text-muted hover:bg-surface-input hover:text-text-primary'
                    "
                    :aria-label="isGenerating ? '停止重新生成' : '重新生成回复'"
                    @click="isGenerating ? chatStore.abortRegenerate() : regenerate(index)"
                  >
                    <Icon v-if="!isGenerating" icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
                    <Icon v-else icon="lucide:square" class="h-3.5 w-3.5 fill-current" />
                  </button>
                  <button
                    v-tooltip="'删除此轮对话'"
                    type="button"
                    class="rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
                    aria-label="删除此轮对话"
                    @click="deleteTurnFromAssistant(index)"
                  >
                    <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- 继续生成按钮 -->
                <div
                  v-if="
                    index === chatStore.currentMessages.length - 1 &&
                    chatStore.lastInterruptedChatId === chatStore.currentChatId
                  "
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
          v-tooltip="'滚动到最新'"
          type="button"
          class="absolute bottom-6 right-8 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary shadow-lg transition-all duration-200 hover:bg-surface-input hover:text-text-primary hover:shadow-xl hover:scale-105"
          aria-label="滚动到最新"
          @click="scrollToBottomOnEnter"
        >
          <Icon icon="lucide:chevron-down" class="h-5 w-5" />
        </button>
      </Transition>

      <!-- Undo delete toast -->
      <Transition name="fade">
        <button
          v-if="chatStore.undoState"
          type="button"
          class="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-text-primary shadow-lg transition-all duration-200 hover:bg-surface-input"
          @click="chatStore.undoDelete()"
        >
          <Icon icon="lucide:undo-2" class="h-4 w-4 text-primary" />
          <span>已删除，点击撤销</span>
        </button>
      </Transition>
    </template>

    <!-- Edit modal -->
    <Modal
      :show="isEditModalOpen"
      title="编辑提示词"
      confirm-text="保存"
      @close="closeEditModal"
      @confirm="saveEditedMessage"
    >
      <textarea
        v-model="editingContent"
        class="min-h-[100px] w-full resize-none rounded-lg border border-border bg-surface-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors duration-200"
        placeholder="请输入新的提示词..."
      />
    </Modal>

    <!-- Rename modal -->
    <Modal
      :show="isRenameModalOpen"
      title="重命名此对话"
      confirm-text="重命名"
      @close="closeRenameModal"
      @confirm="saveChatTitle"
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
/* Ambient breathing gradient */
@keyframes breath {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}
.animate-breath {
  animation: breath 8s ease-in-out infinite;
}

/* Staggered entrance for suggestion cards */
@keyframes cardEnter {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 50%);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
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
