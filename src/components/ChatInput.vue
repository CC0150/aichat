<script setup>
import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useAppStore } from '@/stores/app'
import { requestChatStream, autoResize as autoResizeTextarea } from '@/utils'
import { buildMessagesWithContext } from '@/utils/messageBuilder'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth/mammoth.browser'

// 配置 pdf.js worker（使用 Vite 的 ?url 语法获取正确的静态资源路径）
GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const input = ref('')
const router = useRouter()
const chatStore = useChatStore()
const appStore = useAppStore()
const isSending = ref(false)
const textareaRef = ref(null)
const isModelMenuOpen = ref(false)

// 附件解析相关（PDF / Word / 文本类）
const fileInputRef = ref(null)
// 单个附件：{ id, name, text, type: 'pdf' | 'word' }
const attachments = ref([])
const isParsingAttachment = ref(false)

const MAX_CONTEXT_CHARS = 8000
const MAX_ATTACHMENTS = 5

// 图片上传相关
const imageInputRef = ref(null)
// 单张图片：{ id, name, url, file }
const images = ref([])
const MAX_IMAGES = 5

/**
 * 触发隐藏的文件选择框，用于选择 PDF / Word 附件
 */
function triggerFileSelect() {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

/**
 * 处理附件选择变更事件：解析 PDF / Word / 文本类文件，并填充到 attachments
 */
async function handleFileChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  isParsingAttachment.value = true
  const remaining = MAX_ATTACHMENTS - attachments.value.length
  if (remaining <= 0) {
    console.warn(`最多只能添加 ${MAX_ATTACHMENTS} 个附件`)
    isParsingAttachment.value = false
    event.target.value = ''
    return
  }

  const filesToProcess = files.slice(0, remaining)

  for (const file of filesToProcess) {
    try {
      const name = file.name.toLowerCase()
      const type = file.type

      if (type === 'application/pdf' || name.endsWith('.pdf')) {
        const text = await extractTextFromPdf(file)
        if (text) {
          attachments.value.push({
            id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            text,
            type: 'pdf',
          })
        }
      } else if (
        type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        name.endsWith('.docx')
      ) {
        // 仅支持 .docx，mammoth 不支持旧版 .doc
        const text = await extractTextFromDoc(file)
        if (text) {
          attachments.value.push({
            id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            text,
            type: 'word',
          })
        }
      } else if (
        type === 'text/plain' ||
        name.endsWith('.txt') ||
        type === 'application/json' ||
        name.endsWith('.json') ||
        type === 'text/csv' ||
        type === 'application/vnd.ms-excel' ||
        name.endsWith('.csv')
      ) {
        const text = await file.text()
        if (text && text.trim()) {
          attachments.value.push({
            id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            text,
            type: 'text',
          })
        }
      } else if (
        type === 'application/msword' ||
        name.endsWith('.doc')
      ) {
        console.warn(`不支持的 Word 格式（.doc）：${file.name}，请另存为 .docx 后再上传。`)
      }
    } catch (err) {
      console.error('解析附件失败:', err)
    }
  }

  // 清空 input 的值，方便下次选择同一个文件
  event.target.value = ''
  isParsingAttachment.value = false
}

/**
 * 清空所有附件上下文与选择状态
 */
function clearAttachment() {
  attachments.value = []
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

/**
 * 从附件列表中移除指定附件
 */
function removeAttachment(id) {
  attachments.value = attachments.value.filter((a) => a.id !== id)
  if (!attachments.value.length && fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

/**
 * 从图片列表中移除指定图片，并释放对应的本地预览 URL
 */
function removeImage(id) {
  const img = images.value.find((i) => i.id === id)
  if (img && img.url) {
    URL.revokeObjectURL(img.url)
  }
  images.value = images.value.filter((i) => i.id !== id)
  if (!images.value.length && imageInputRef.value) {
    imageInputRef.value.value = ''
  }
}

/**
 * 清空所有已选择的图片，并释放本地预览 URL
 */
function clearImages() {
  images.value.forEach((img) => {
    if (img.url) URL.revokeObjectURL(img.url)
  })
  images.value = []
  if (imageInputRef.value) {
    imageInputRef.value.value = ''
  }
}

/**
 * 使用 pdfjs-dist 从 PDF 文件中提取前若干页的纯文本
 */
async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  const maxPages = 20
  const total = Math.min(pdf.numPages, maxPages)
  let fullText = ''

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => item.str || '')
      .join(' ')
    fullText += `\n\n【第 ${i} 页】\n${pageText}`
  }

  return fullText.trim()
}

/**
 * 使用 mammoth 从 docx 文件中提取纯文本
 */
async function extractTextFromDoc(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return (result && result.value ? result.value : '').trim()
}

/**
 * 选择当前使用的模型（更新 appStore.currentModelId）
 */
function selectModel(id) {
  appStore.setCurrentModelId(id)
  isModelMenuOpen.value = false
}

/**
 * 自适应调整 textarea 高度
 */
function autoResize(el) {
  autoResizeTextarea(el, 200)
}

/**
 * 输入事件处理：更新高度
 */
function onInput(e) {
  autoResize(e.target)
}

/**
 * 触发隐藏的图片选择框（上传图片）
 */
function triggerImageSelect() {
  if (imageInputRef.value) {
    imageInputRef.value.click()
  }
}

/**
 * 处理图片选择变更事件：将图片加入 images 列表
 */
async function handleImageChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return

  await addImagesFromFiles(files)
  event.target.value = ''
}

/**
 * 将一批图片文件加入 images 列表（受数量上限约束）
 */
async function addImagesFromFiles(files) {
  const remaining = MAX_IMAGES - images.value.length
  if (remaining <= 0) {
    console.warn(`最多只能上传 ${MAX_IMAGES} 张图片`)
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

/**
 * 处理粘贴事件：从剪贴板中提取图片并加入 images
 */
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

  if (imageFiles.length) {
    await addImagesFromFiles(imageFiles)
  }
}

/**
 * 处理 Enter 键：Enter 发送，Shift+Enter 换行
 */
function onEnterKey(e) {
  if (e.shiftKey) {
    // Shift+Enter：换行，保持默认行为
    return
  }
  e.preventDefault()
  send()
}

/**
 * 从输入框触发发送：做基本校验后委托给 sendMessage
 */
async function send() {
  if (isSending.value) return

  const text = input.value?.trim()
  if (!text) return

  await sendMessage(text)
  // 发送后重置高度为初始值
  if (textareaRef.value) {
    textareaRef.value.style.height = ''
  }
}

/**
 * 真正的发送入口：支持多轮上下文、附件文本和多张图片（多模态）
 * 可被父组件通过 defineExpose 调用
 */
// 从外部调用发送消息（同时支持附件文本与多张图片）
async function sendMessage(content) {
  if (isSending.value) return

  const raw = typeof content === 'string' ? content : ''
  const text = raw.trim()
  if (!text && !images.value.length && !attachments.value.length) return

  isSending.value = true
  input.value = ''

  // 添加用户消息（聊天记录中仍以字符串形式存储）
  chatStore.addMessage('user', text)

  // 跳转到对应聊天页面
  if (chatStore.currentChatId) {
    router.replace({ name: 'ChatById', params: { id: chatStore.currentChatId } })
  }

  // 添加空的 assistant 消息占位
  chatStore.addMessage('assistant', '')

  try {
    // 构造带有附件和图片上下文的完整 messages 列表
    const { messages, historyHasImages } = await buildMessagesWithContext({
      history: chatStore.currentMessages,
      text,
      attachments: attachments.value,
      images: images.value,
      maxContextChars: MAX_CONTEXT_CHARS,
    })

    // 若历史或当前消息中包含图片，则自动切换到视觉模型 glm-4.6v
    if (historyHasImages && appStore.currentModelId !== 'glm46v') {
      appStore.setCurrentModelId('glm46v')
    }

    const modelConfig = appStore.currentModel

    await requestChatStream({
      model: modelConfig.model,
      messages,
      onChunk: (chunk) => chatStore.appendToLastMessage(chunk),
      onError: (msg) => chatStore.setLastAssistantMessage(`错误：${msg}`),
    })

    // 发送成功后清理附件与图片预览
    clearAttachment()
    clearImages()
  } catch (error) {
    console.error('API 调用失败:', error)
    // 在对话框中显示错误信息
    chatStore.setLastAssistantMessage(`错误：${error.message}`)
  } finally {
    isSending.value = false
  }
}

// 导出方法供父组件调用
defineExpose({
  sendMessage
})
</script>

<template>
  <div class="shrink-0 border-t border-border bg-background p-4">
    <!-- 输入框：上方文本域，下方左右控件 -->
    <div
      class="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-border bg-surface-input px-4 py-3 shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <textarea ref="textareaRef" v-model="input"
        class="min-h-[50px] w-full resize-none bg-transparent py-1 text-text-primary placeholder:text-text-muted focus:outline-none transition-[height] duration-150 ease-out"
        rows="1" placeholder="问问 AIChat（Enter 发送，Shift+Enter 换行）" @keydown.enter="onEnterKey" @input="onInput"
        @paste="handlePaste" />
      <!-- 附件解析状态提示 -->
      <div v-if="isParsingAttachment || attachments.length" class="flex flex-col gap-1 text-xs text-text-muted">
        <div class="flex items-center justify-between">
          <div>
            <span v-if="isParsingAttachment">正在解析附件内容……</span>
            <span v-else>已加载 {{ attachments.length }} 个附件（最多可添加 {{ MAX_ATTACHMENTS }} 个）</span>
          </div>
          <button v-if="!isParsingAttachment && attachments.length" type="button"
            class="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10"
            @click="clearAttachment">
            <Icon icon="lucide:x" class="h-3 w-3" />
            <span>清空全部</span>
          </button>
        </div>
        <!-- 单个附件条目，可逐个移除 -->
        <div v-if="attachments.length" class="flex flex-wrap gap-1">
          <div v-for="att in attachments" :key="att.id"
            class="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] text-text-secondary">
            <span class="max-w-[140px] truncate">{{ att.name }}</span>
            <button type="button" class="text-text-muted hover:text-red-500" @click="removeAttachment(att.id)"
              aria-label="移除附件">
              <Icon icon="lucide:x" class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      <!-- 图片上传状态与缩略图 -->
      <div v-if="images.length" class="flex flex-col gap-1 text-xs text-text-muted">
        <div class="flex items-center justify-between">
          <span>已选择 {{ images.length }} 张图片（最多可上传 {{ MAX_IMAGES }} 张）</span>
          <button type="button"
            class="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10"
            @click="clearImages">
            <Icon icon="lucide:x" class="h-3 w-3" />
            <span>清空图片</span>
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <div v-for="img in images" :key="img.id"
            class="relative h-14 w-14 overflow-hidden rounded-md border border-border bg-surface-elevated">
            <img :src="img.url" :alt="img.name" class="h-full w-full object-cover" />
            <button type="button"
              class="absolute -right-1 -top-1 rounded-full bg-background/90 p-0.5 text-text-muted hover:text-red-500 shadow"
              @click="removeImage(img.id)" aria-label="移除图片">
              <Icon icon="lucide:x" class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <button type="button"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            aria-label="添加附件" @click="triggerFileSelect">
            <Icon icon="lucide:link" class="h-5 w-5" />
            <span class="text-sm">添加附件</span>
          </button>
          <!-- 隐藏的文件选择框：支持 PDF / docx / txt / json / csv -->
          <input ref="fileInputRef" type="file" class="hidden" multiple
            accept=".pdf,.docx,.txt,.json,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/json,text/csv,application/vnd.ms-excel"
            @change="handleFileChange" />
          <button type="button"
            class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary"
            aria-label="上传图片" @click="triggerImageSelect">
            <Icon icon="lucide:image" class="h-5 w-5" />
            <span class="text-sm">上传图片</span>
          </button>
          <!-- 隐藏的图片选择框：支持多张图片 -->
          <input ref="imageInputRef" type="file" class="hidden" multiple accept="image/*" @change="handleImageChange" />
        </div>
        <div class="flex items-center gap-1">
          <!-- 模型切换按钮：显示当前模型名称 -->
          <div class="relative">
            <button type="button"
              class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-text-muted hover:bg-surface-elevated hover:text-text-primary"
              @click="isModelMenuOpen = !isModelMenuOpen">
              <span>{{ appStore.currentModel.shortLabel }}</span>
              <Icon icon="lucide:chevron-down" class="h-4 w-4" />
            </button>
            <transition name="fade">
              <div v-if="isModelMenuOpen"
                class="absolute right-0 bottom-full z-20 mb-1 w-44 rounded-lg border border-border bg-surface-elevated p-1 shadow-lg">
                <button v-for="m in appStore.modelOptions" :key="m.id" type="button"
                  class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-input hover:text-text-primary"
                  @click="selectModel(m.id)">
                  <span class="truncate">{{ m.label }}</span>
                  <Icon v-if="m.id === appStore.currentModelId" icon="lucide:check" class="h-4 w-4 text-primary" />
                </button>
              </div>
            </transition>
          </div>
          <button type="button"
            class="rounded-lg p-1.5 text-primary hover:bg-primary-muted disabled:opacity-50 disabled:pointer-events-none"
            aria-label="发送" @click="send" :disabled="isSending">
            <Icon icon="lucide:send" class="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
