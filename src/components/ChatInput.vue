<script setup>
import { Icon } from '@iconify/vue'
import { ref, computed, onMounted, onUnmounted, TransitionGroup } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useAppStore } from '@/stores/app'
import { useInterviewStore } from '@/stores/interview'
import { requestChatStream, autoResize as autoResizeTextarea, isAbortError } from '@/utils'
import { buildMessagesWithContext } from '@/utils/messageBuilder'
import { difficultyMap } from '@/utils/interviewHelpers'
import { parseFile } from '@/utils/docParser'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { watch } from 'vue'

const input = ref('')
const router = useRouter()
const chatStore = useChatStore()
const appStore = useAppStore()
const interviewStore = useInterviewStore()
const isSending = ref(false)
const isBusy = computed(() => isSending.value || chatStore.isRegenerating)
let activeController = null
const textareaRef = ref(null)
const isModelMenuOpen = ref(false)

// 面试记录引用
const selectedInterview = ref(null)
const isInterviewMenuOpen = ref(false)

const canSend = computed(() => !!input.value?.trim())
const hasInterviewAttachment = computed(() => attachments.value.some((a) => a.type === 'interview'))

const fileInputRef = ref(null)
const attachments = ref([])
const isParsingAttachment = ref(false)

const MAX_CONTEXT_CHARS = 8000
const MAX_ATTACHMENTS = 5

const imageInputRef = ref(null)
const images = ref([])
const MAX_IMAGES = 5

function triggerFileSelect() {
  if (fileInputRef.value) fileInputRef.value.click()
}

async function handleFileChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  isParsingAttachment.value = true
  const remaining = MAX_ATTACHMENTS - attachments.value.length
  if (remaining <= 0) {
    console.warn(`Max ${MAX_ATTACHMENTS} attachments`)
    isParsingAttachment.value = false
    event.target.value = ''
    return
  }

  const filesToProcess = files.slice(0, remaining)
  for (const file of filesToProcess) {
    try {
      const parsed = await parseFile(file)
      if (parsed.text) {
        attachments.value.push({
          id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: parsed.name,
          text: parsed.text,
          type: parsed.type,
        })
      }
    } catch (err) {
      console.error(err)
      alert(err?.message || `Failed to parse: ${file.name}`)
    }
  }

  event.target.value = ''
  isParsingAttachment.value = false
}

function clearAttachment() {
  attachments.value = []
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function getAttachmentIcon(att) {
  if (att?.type === 'interview') return { icon: 'lucide:clipboard-list', class: 'text-primary' }
  const name = (att?.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return { icon: 'lucide:file-text', class: 'text-red-500' }
  if (name.endsWith('.docx') || name.endsWith('.doc'))
    return { icon: 'lucide:file-text', class: 'text-blue-500' }
  return { icon: 'lucide:file', class: 'text-text-muted' }
}

function removeAttachment(id) {
  const att = attachments.value.find((a) => a.id === id)
  if (att?.type === 'interview') selectedInterview.value = null
  attachments.value = attachments.value.filter((a) => a.id !== id)
  if (!attachments.value.length && fileInputRef.value) fileInputRef.value.value = ''
}

function removeImage(id) {
  const img = images.value.find((i) => i.id === id)
  if (img && img.url) URL.revokeObjectURL(img.url)
  images.value = images.value.filter((i) => i.id !== id)
  if (!images.value.length && imageInputRef.value) imageInputRef.value.value = ''
}

function clearImages() {
  images.value = []
  if (imageInputRef.value) imageInputRef.value.value = ''
}

function selectModel(id) {
  appStore.setCurrentModelId(id)
  isModelMenuOpen.value = false
}

function selectInterview(record) {
  // 移除旧的面试附件
  clearInterview()
  selectedInterview.value = record
  isInterviewMenuOpen.value = false
  // 生成虚拟附件，内容走附件通道（system message），气泡里不显示
  const fileText = formatInterviewContent(record)
  attachments.value.push({
    id: `interview-${record.id}`,
    name: `${record.typeLabel || '面试记录'}（${new Date(record.finishedAt).toLocaleDateString('zh-CN')}）.txt`,
    text: fileText,
    type: 'interview',
  })
}

function clearInterview() {
  selectedInterview.value = null
  attachments.value = attachments.value.filter((a) => a.type !== 'interview')
}

function formatInterviewContent(record) {
  if (!record) return ''

  const dateStr = new Date(record.finishedAt).toLocaleDateString('zh-CN')
  const parts = []

  // 概览
  parts.push(`[面试记录 - 完整内容]`)
  parts.push(`类型：${record.typeLabel || ''} | 日期：${dateStr} | 总分：${record.totalScore}/10`)
  parts.push(``)

  // 逐题详情
  const questions = record.questions || []
  const answers = record.answers || {}
  const scores = record.scores || {}

  questions.forEach((q, idx) => {
    const s = scores[q.id] || {}
    const answer = answers[q.id] || '(未作答)'
    const diffLabel = difficultyMap[q.difficulty] || q.difficulty

    parts.push(`### 第${idx + 1}题（${diffLabel} - ${q.category}）`)
    parts.push(`题目：${q.question}`)
    parts.push(`你的回答：${answer}`)
    if (s.score != null) {
      parts.push(
        `得分：${s.score}/10（正确性:${s.correctness ?? '-'} 完整性:${s.completeness ?? '-'} 清晰度:${s.clarity ?? '-'}）`,
      )
    }
    if (s.feedback) {
      parts.push(`AI点评：${s.feedback}`)
    }
    if (s.improvedAnswer) {
      parts.push(`参考回答：${s.improvedAnswer}`)
    }
    parts.push(``)
  })

  // 薄弱知识点汇总
  const weak = []
  for (const q of questions) {
    const s = scores[q.id]
    if (s && s.score < 5) {
      for (const kp of q.knowledgePoints || []) {
        weak.push(`${kp}(${s.score}分)`)
      }
    }
  }
  if (weak.length) {
    parts.push(`## 薄弱知识点`)
    parts.push(weak.join('、'))
    parts.push(``)
  }

  parts.push(`---`)
  return parts.join('\n') + '\n'
}

function autoResize(el) {
  autoResizeTextarea(el, 200)
}

function onInput(e) {
  autoResize(e.target)
}

function triggerImageSelect() {
  if (imageInputRef.value) imageInputRef.value.click()
}

async function handleImageChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  await addImagesFromFiles(files)
  event.target.value = ''
}

async function addImagesFromFiles(files) {
  const remaining = MAX_IMAGES - images.value.length
  if (remaining <= 0) {
    console.warn(`Max ${MAX_IMAGES} images`)
    return
  }
  const filesToUse = files.slice(0, remaining)
  for (const file of filesToUse) {
    if (!file.type.startsWith('image/')) continue
    const url = URL.createObjectURL(file)
    images.value.push({
      id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      url,
      file,
    })
  }
}

async function handlePaste(e) {
  const items = e.clipboardData?.items
  if (!items || !items.length) return
  const imageFiles = []
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) imageFiles.push(file)
    }
  }
  if (imageFiles.length) await addImagesFromFiles(imageFiles)
}

function onEnterKey(e) {
  if (e.shiftKey) return
  e.preventDefault()
  onSendOrStop()
}

async function send() {
  if (isBusy.value) return
  const text = input.value?.trim()
  if (!text) return
  await sendMessage(text)
  if (textareaRef.value) textareaRef.value.style.height = ''
}

function abortCurrentRequest() {
  if (activeController) {
    try {
      activeController.abort()
    } catch (_) {}
    activeController = null
  }
  chatStore.abortRegenerate()
  isSending.value = false
  // 标记中断，允许继续生成
  if (chatStore.currentChatId) {
    const msgs = chatStore.currentMessages
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant' && String(last.content || '').trim()) {
      chatStore.lastInterruptedChatId = chatStore.currentChatId
    }
  }
}

function onSendOrStop() {
  if (isBusy.value) {
    abortCurrentRequest()
    return
  }
  send()
}

function buildMessagesForContinue() {
  const raw = chatStore.currentMessages.slice(-20)
  return raw
    .filter((m) => {
      if (!m) return false
      const c = m.content
      if (typeof c === 'string') return !!c.trim()
      if (Array.isArray(c)) return c.length > 0
      if (c && typeof c === 'object')
        return !!(c.text != null || c.attachments?.length || c.images?.length)
      return !!c
    })
    .map((m) => {
      let content = m.content
      if (content && typeof content === 'object' && !Array.isArray(content)) {
        content = content.text != null ? String(content.text) : ''
      }
      return { role: m.role, content }
    })
}

async function continueGeneration() {
  if (isBusy.value) return
  const messages = buildMessagesForContinue()
  if (messages.length === 0) return
  const lastMsg = messages[messages.length - 1]
  if (lastMsg.role !== 'assistant') return

  isSending.value = true
  chatStore.lastInterruptedChatId = null

  const controller = new AbortController()
  activeController = controller

  try {
    const modelConfig = appStore.currentModel
    if (controller.signal.aborted) return

    const streamingChatId = chatStore.currentChatId
    await requestChatStream({
      model: modelConfig.model,
      messages,
      onChunk: (chunk) => {
        if (chatStore.currentChatId === streamingChatId) chatStore.appendToLastMessage(chunk)
      },
      onError: (msg) => {
        if (chatStore.currentChatId === streamingChatId)
          chatStore.setLastAssistantMessage(`Error: ${msg}（点击重新生成按钮重试）`)
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      const msgs = chatStore.currentMessages
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'assistant' && !String(last.content || '').trim()) {
        chatStore.setLastAssistantMessage('(Stopped)')
      }
    } else {
      console.error('API error:', error)
      chatStore.setLastAssistantMessage(`Error: ${error.message}`)
    }
  } finally {
    if (activeController === controller) activeController = null
    isSending.value = false
  }
}

async function sendMessage(content) {
  if (isBusy.value) return

  const raw = typeof content === 'string' ? content : ''
  const text = raw.trim()
  if (!text) return

  isSending.value = true
  input.value = ''
  chatStore.lastInterruptedChatId = null

  const controller = new AbortController()
  activeController = controller

  const hasAttachments = attachments.value.length > 0
  const hasImages = images.value.length > 0
  if (hasAttachments || hasImages) {
    const attachmentSnapshots = attachments.value.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      text: a.text,
    }))
    const imageSnapshots = images.value.map((img) => ({
      id: img.id,
      name: img.name,
      url: img.url,
    }))
    chatStore.addMessage('user', { text, attachments: attachmentSnapshots, images: imageSnapshots })
  } else {
    chatStore.addMessage('user', text)
  }

  // 清除面试记录引用（附件内容已通过 snapshot 发送）
  if (selectedInterview.value) selectedInterview.value = null

  if (chatStore.currentChatId) {
    router.replace({ name: 'ChatById', params: { id: chatStore.currentChatId } })
  }

  chatStore.addMessage('assistant', '')

  try {
    const { messages } = await buildMessagesWithContext({
      history: chatStore.currentMessages,
      text,
      attachments: attachments.value,
      images: images.value,
      maxContextChars: MAX_CONTEXT_CHARS,
      supportsVision: appStore.currentModel?.supportsVision ?? false,
    })

    if (controller.signal.aborted) return
    const modelConfig = appStore.currentModel
    if (controller.signal.aborted) return

    const streamingChatId = chatStore.currentChatId
    await requestChatStream({
      model: modelConfig.model,
      messages,
      onChunk: (chunk) => {
        if (chatStore.currentChatId === streamingChatId) chatStore.appendToLastMessage(chunk)
      },
      onError: (msg) => {
        if (chatStore.currentChatId === streamingChatId)
          chatStore.setLastAssistantMessage(`Error: ${msg}（点击重新生成按钮重试）`)
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      const last = chatStore.currentMessages[chatStore.currentMessages.length - 1]
      if (last && last.role === 'assistant' && (!last.content || !String(last.content).trim())) {
        chatStore.setLastAssistantMessage('(Stopped)')
      }
    } else {
      console.error('API error:', error)
      chatStore.setLastAssistantMessage(`Error: ${error.message}`)
    }
  } finally {
    if (activeController === controller) activeController = null
    isSending.value = false
    clearAttachment()
    clearImages()
  }
}

const {
  isRecording,
  init: initSpeechRecognition,
  stop: stopSpeechRecognition,
  toggle: toggleSpeechRecognition,
} = useSpeechRecognition({
  onResult(text) {
    input.value = input.value + text
    if (textareaRef.value) autoResize(textareaRef.value)
  },
})

function toggleRecording() {
  if (!toggleSpeechRecognition()) {
    alert('Speech recognition is not supported. Please use Chrome, Edge, or Safari.')
  }
}

onMounted(() => {
  initSpeechRecognition()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (activeController) {
    try {
      activeController.abort()
    } catch (_) {}
    activeController = null
  }
  isSending.value = false
  stopSpeechRecognition()
})

watch(
  () => chatStore.currentChatId,
  (newId, oldId) => {
    if (oldId != null && newId != null && oldId !== newId && isSending.value) {
      abortCurrentRequest()
    }
  },
)

function handleBeforeUnload() {
  if (isSending.value && activeController) activeController.abort()
}

defineExpose({ sendMessage, continueGeneration })
</script>

<template>
  <div class="shrink-0 border-t border-border bg-background/80 backdrop-blur-md p-2 sm:p-4">
    <div
      class="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-surface-elevated px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm transition-all duration-200 focus-within:border-primary focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary-muted"
    >
      <!-- Attachments -->
      <div v-if="isParsingAttachment || attachments.length" class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs text-text-muted">
          <span v-if="isParsingAttachment">正在解析附件内容……</span>
          <span v-else
            >已加载 {{ attachments.length }} 个附件（最多可添加 {{ MAX_ATTACHMENTS }} 个）</span
          >
          <button
            v-if="!isParsingAttachment && attachments.length"
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-red-500 transition-colors hover:bg-red-500/10"
            @click="clearAttachment"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
            <span>清空全部</span>
          </button>
        </div>
        <TransitionGroup name="attachment-slide" tag="div" class="flex flex-wrap gap-2 mb-2">
          <div
            v-if="isParsingAttachment"
            key="parsing"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-input px-2.5 py-1.5"
          >
            <Icon
              icon="lucide:loader-2"
              class="h-3.5 w-3.5 shrink-0 animate-spin text-text-muted"
            />
            <span class="text-xs font-medium text-text-muted">解析中...</span>
          </div>
          <div
            v-for="att in attachments"
            :key="att.id"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-input px-2.5 py-1.5"
          >
            <Icon
              :icon="getAttachmentIcon(att).icon"
              :class="['h-3.5 w-3.5 shrink-0', getAttachmentIcon(att).class]"
            />
            <span class="max-w-[150px] truncate text-xs font-medium text-text-primary">{{
              att.name
            }}</span>
            <button
              type="button"
              class="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
              aria-label="Remove attachment"
              @click="removeAttachment(att.id)"
            >
              <Icon icon="lucide:x" class="h-3 w-3" />
            </button>
          </div>
        </TransitionGroup>
      </div>

      <!-- Textarea -->
      <div class="relative">
        <textarea
          ref="textareaRef"
          v-model="input"
          class="min-h-[50px] w-full resize-none bg-transparent py-1 pr-8 text-[15px] leading-relaxed text-text-primary placeholder:text-text-muted focus:outline-none transition-[height] duration-150 ease-out"
          rows="1"
          placeholder="向 Intervy 提问"
          aria-label="输入消息"
          @keydown.enter="onEnterKey"
          @input="onInput"
          @paste="handlePaste"
        />
        <button
          v-if="input"
          v-tooltip="'清空输入'"
          type="button"
          class="absolute right-0 top-1 flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
          aria-label="清空输入内容"
          @click="
            input = ''
            textareaRef?.focus()
          "
        >
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>
      </div>

      <!-- Images -->
      <div v-if="images.length" class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs text-text-muted">
          <span>已选择 {{ images.length }} 张图片（最多可上传 {{ MAX_IMAGES }} 张）</span>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-red-500 transition-colors hover:bg-red-500/10"
            @click="clearImages"
          >
            <Icon icon="lucide:x" class="h-3 w-3" />
            <span>清空图片</span>
          </button>
        </div>
        <TransitionGroup name="image-slide" tag="div" class="flex flex-wrap gap-2 mb-2">
          <div
            v-for="img in images"
            :key="img.id"
            class="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-input"
          >
            <img :src="img.url" :alt="img.name" class="h-full w-full object-cover" />
            <button
              type="button"
              class="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-text-muted shadow-sm transition-colors hover:bg-red-500/10 hover:text-red-500"
              aria-label="Remove image"
              @click="removeImage(img.id)"
            >
              <Icon icon="lucide:x" class="h-3 w-3" />
            </button>
          </div>
        </TransitionGroup>
      </div>

      <!-- Toolbar -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-0.5">
          <button
            v-tooltip="'添加附件（支持 PDF、Word、TXT、JSON、CSV）'"
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
            aria-label="添加附件"
            @click="triggerFileSelect"
          >
            <Icon icon="lucide:link" class="h-[17px] w-[17px]" />
            <span class="hidden sm:inline">添加附件</span>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            multiple
            accept=".pdf,.docx,.txt,.json,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/json,text/csv,application/vnd.ms-excel"
            @change="handleFileChange"
          />
          <button
            v-tooltip="'上传图片（支持多张）'"
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
            aria-label="上传图片"
            @click="triggerImageSelect"
          >
            <Icon icon="lucide:image" class="h-[17px] w-[17px]" />
            <span class="hidden sm:inline">上传图片</span>
          </button>
          <input
            ref="imageInputRef"
            type="file"
            class="hidden"
            multiple
            accept="image/*"
            @change="handleImageChange"
          />
          <button
            v-tooltip="isRecording ? '停止录音' : '语音输入'"
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200"
            :class="
              isRecording
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/15'
                : 'text-text-muted hover:bg-surface-input hover:text-text-primary'
            "
            :aria-label="isRecording ? '停止录音' : '语音输入'"
            @click="toggleRecording"
          >
            <Icon :icon="isRecording ? 'lucide:mic-off' : 'lucide:mic'" class="h-[17px] w-[17px]" />
            <span class="hidden sm:inline">{{ isRecording ? '录音中...' : '语音' }}</span>
            <span v-if="isRecording" class="relative flex h-2 w-2 ml-0.5">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
              />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          </button>
        </div>

        <div class="flex items-center gap-1">
          <!-- Interview record selector -->
          <div v-if="interviewStore.history.length" class="relative">
            <button
              v-tooltip="'引用面试记录进行分析'"
              type="button"
              class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200"
              :class="
                hasInterviewAttachment
                  ? 'text-primary hover:bg-primary-muted/30'
                  : 'text-text-muted hover:bg-surface-input hover:text-text-primary'
              "
              @click="isInterviewMenuOpen = !isInterviewMenuOpen"
            >
              <Icon icon="lucide:clipboard-list" class="h-[17px] w-[17px]" />
            </button>
            <transition name="fade">
              <div
                v-if="isInterviewMenuOpen"
                class="absolute right-0 bottom-full z-20 mb-1.5 w-56 sm:w-64 rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
              >
                <div
                  v-if="interviewStore.history.length === 0"
                  class="px-3 py-2 text-xs text-text-muted"
                >
                  暂无面试记录
                </div>
                <button
                  v-for="record in interviewStore.history.slice(0, 10)"
                  :key="record.id"
                  type="button"
                  class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-input"
                  @click="selectInterview(record)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="text-[13px] text-text-secondary truncate">
                      {{ record.typeLabel || '面试记录' }}
                    </div>
                    <div class="text-[11px] text-text-muted">
                      {{ new Date(record.finishedAt).toLocaleDateString('zh-CN') }} ·
                      {{ record.totalScore }}/10 分
                    </div>
                  </div>
                  <Icon icon="lucide:arrow-right" class="h-3.5 w-3.5 shrink-0 text-text-muted" />
                </button>
              </div>
            </transition>
          </div>

          <!-- Model selector -->
          <div class="relative">
            <button
              v-tooltip="`当前模型：${appStore.currentModel.label}`"
              type="button"
              class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
              @click="isModelMenuOpen = !isModelMenuOpen"
            >
              <span>{{ appStore.currentModel.shortLabel }}</span>
              <Icon
                icon="lucide:chevron-down"
                class="h-3.5 w-3.5 transition-transform duration-200"
                :class="{ 'rotate-180': isModelMenuOpen }"
              />
            </button>
            <transition name="fade">
              <div
                v-if="isModelMenuOpen"
                class="absolute right-0 bottom-full z-20 mb-1.5 w-48 rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
              >
                <button
                  v-for="m in appStore.modelOptions"
                  :key="m.id"
                  type="button"
                  class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] text-text-secondary transition-colors duration-150 hover:bg-surface-input hover:text-text-primary"
                  @click="selectModel(m.id)"
                >
                  <span class="truncate">{{ m.label }}</span>
                  <Icon
                    v-if="m.id === appStore.currentModelId"
                    icon="lucide:check"
                    class="h-4 w-4 shrink-0 text-primary"
                  />
                </button>
              </div>
            </transition>
          </div>

          <!-- Send / Stop -->
          <button
            v-tooltip="isBusy ? '停止生成' : '发送（Enter 发送，Shift+Enter 换行）'"
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200"
            :class="
              isBusy
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/15'
                : canSend
                  ? 'bg-primary text-white shadow-sm hover:brightness-110 hover:shadow-md'
                  : 'bg-surface-input text-text-muted'
            "
            :aria-label="isBusy ? '停止生成' : '发送'"
            :disabled="!isBusy && !canSend"
            @click="onSendOrStop"
          >
            <Icon v-if="!isBusy" icon="lucide:arrow-up" class="h-[18px] w-[18px]" />
            <Icon v-else icon="lucide:square" class="h-[15px] w-[15px] fill-current" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
