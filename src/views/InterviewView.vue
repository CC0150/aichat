<script setup>
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useInterviewStore } from '@/stores/interview'
import { useAppStore } from '@/stores/app'
import { interviewTypes } from '@/data/questions/index.js'
import { requestGenerateQuestions, requestGenerateQuestionsByRole } from '@/utils/interviewApi'
import { parseFile } from '@/utils/docParser'
import { useKnowledgeStore } from '@/stores/knowledge'
import InterviewSession from '@/components/interview/InterviewSession.vue'

const router = useRouter()
const interviewStore = useInterviewStore()
const appStore = useAppStore()
const knowledgeStore = useKnowledgeStore()

const activeTab = ref('bank') // 'bank' | 'file' | 'knowledge'
const selectedType = ref(null)

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'knowledge') {
    knowledgeStore.fetchKBs()
  }
}
const questionCount = ref(5)
const difficulty = ref('all')

const typeOptions = Object.entries(interviewTypes).map(([key, val]) => ({
  key,
  ...val,
}))

const countPresets = [5, 8, 10, 15]
const isCustomCount = ref(false)
const customCountInput = ref('')
const countInputRef = ref(null)
const MAX_QUESTIONS = 50

function selectCountPreset(n) {
  questionCount.value = n
  isCustomCount.value = false
}

function enableCustomCount() {
  isCustomCount.value = true
  customCountInput.value = String(questionCount.value)
  requestAnimationFrame(() => countInputRef.value?.focus())
}

function applyCustomCount() {
  const n = parseInt(customCountInput.value, 10)
  if (!isNaN(n) && n >= 1) {
    questionCount.value = Math.min(n, MAX_QUESTIONS)
  } else {
    customCountInput.value = String(questionCount.value)
  }
  isCustomCount.value = false
}

function onCustomKeydown(e) {
  if (e.key === 'Enter') applyCustomCount()
  if (e.key === 'Escape') {
    customCountInput.value = String(questionCount.value)
    isCustomCount.value = false
  }
}

const difficultyOptions = [
  { value: 'all', label: '混合' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

// ===== 文件出题模式 =====
const fileInputRef = ref(null)
const uploadedFile = ref(null) // { name, text, type }
const isParsing = ref(false)
const isGenerating = ref(false)
const fileError = ref('')

function triggerFileSelect() {
  if (fileInputRef.value) fileInputRef.value.click()
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  const file = files[0]
  isParsing.value = true
  fileError.value = ''
  try {
    const parsed = await parseFile(file)
    if (!parsed.text || parsed.text.trim().length < 50) {
      fileError.value = '文件内容过短（不足 50 字），无法生成有效题目。请上传内容更丰富的文档。'
      uploadedFile.value = null
    } else {
      uploadedFile.value = parsed
    }
  } catch (err) {
    fileError.value = err.message || '文件解析失败，请重试'
    uploadedFile.value = null
  } finally {
    isParsing.value = false
    event.target.value = ''
  }
}

function removeUploadedFile() {
  uploadedFile.value = null
  fileError.value = ''
}

async function startFileInterview() {
  if (!uploadedFile.value || isGenerating.value) return
  isGenerating.value = true
  fileError.value = ''
  try {
    const result = await requestGenerateQuestions({
      content: uploadedFile.value.text,
      questionCount: questionCount.value,
      difficulty: difficulty.value,
      model: appStore.currentModelId,
    })
    if (!result.questions || result.questions.length === 0) {
      fileError.value = result.error || 'AI 未能生成有效题目，请换一个文档重试。'
      return
    }
    interviewStore.loadCustomQuestions(result.questions, uploadedFile.value.name)
  } catch (err) {
    fileError.value = err.message || '题目生成失败，请重试'
  } finally {
    isGenerating.value = false
  }
}

// ===== 知识库出题模式 =====
const selectedKBId = ref(null)
const isKBGenerating = ref(false)
const kbError = ref('')

function selectKB(kbId) {
  selectedKBId.value = kbId
  kbError.value = ''
}

async function startKBInterview() {
  if (!selectedKBId.value || isKBGenerating.value) return
  isKBGenerating.value = true
  kbError.value = ''
  try {
    const result = await knowledgeStore.generateQuestions(selectedKBId.value, {
      questionCount: questionCount.value,
      difficulty: difficulty.value,
      model: appStore.currentModelId,
    })
    if (!result.questions || result.questions.length === 0) {
      kbError.value = result.error || 'AI 未能生成有效题目，请重试。'
      return
    }
    const kb = knowledgeStore.kbs.find((k) => k.id === selectedKBId.value)
    interviewStore.loadCustomQuestions(result.questions, kb ? `知识库：${kb.name}` : '知识库')
  } catch (err) {
    kbError.value = err.message || '题目生成失败，请重试'
  } finally {
    isKBGenerating.value = false
  }
}

// ===== 题库模式 =====

const customRole = ref('')
const isCustomRole = ref(false)
const isRoleGenerating = ref(false)
const roleError = ref('')

function selectCustomRole() {
  const role = customRole.value.trim()
  if (!role) return
  selectedType.value = role
  isCustomRole.value = true
  roleError.value = ''
}

function onRoleKeydown(e) {
  if (e.key === 'Enter') selectCustomRole()
}

function selectType(key) {
  selectedType.value = key
  isCustomRole.value = false
  const type = interviewTypes[key]
  if (type) {
    questionCount.value = type.questionCount
  }
  isCustomCount.value = false
  roleError.value = ''
}

async function startRoleInterview() {
  if (!selectedType.value || isRoleGenerating.value) return
  isRoleGenerating.value = true
  roleError.value = ''
  try {
    const result = await requestGenerateQuestionsByRole({
      role: selectedType.value,
      questionCount: questionCount.value,
      difficulty: difficulty.value,
      model: appStore.currentModelId,
    })
    if (!result.questions || result.questions.length === 0) {
      roleError.value = result.error || 'AI 未能生成有效题目，请重试。'
      return
    }
    interviewStore.loadCustomQuestions(result.questions, `岗位：${selectedType.value}`)
  } catch (err) {
    roleError.value = err.message || '题目生成失败，请重试'
  } finally {
    isRoleGenerating.value = false
  }
}

function startInterview() {
  if (!selectedType.value) return
  interviewStore.startInterview(selectedType.value, questionCount.value, difficulty.value)
}

// 页面挂载时修复可能的不一致状态
onMounted(() => {
  if (
    interviewStore.phase !== 'idle' &&
    interviewStore.phase !== 'finished' &&
    !interviewStore.currentQuestion
  ) {
    interviewStore.resetInterview()
  }
})

function backToHome() {
  interviewStore.resetInterview()
  selectedType.value = null
  questionCount.value = 5
  difficulty.value = 'all'
  uploadedFile.value = null
  fileError.value = ''
  selectedKBId.value = null
  kbError.value = ''
  customRole.value = ''
  isCustomRole.value = false
  roleError.value = ''
  activeTab.value = 'bank'
}

function goToChat() {
  router.push({ name: 'Chat' })
}

import { getScoreColor, getScoreBg } from '@/utils/interviewHelpers'
import { exportRecords } from '@/utils/interviewExport'

// 结束后的统计
const resultStats = computed(() => ({
  totalScore: interviewStore.totalScore,
  categoryStats: interviewStore.categoryStats,
  weakPoints: interviewStore.weakPoints,
  questions: interviewStore.questions,
  scores: interviewStore.scores,
}))

const showExportMenu = ref(false)
const exportFormat = ref('md')

function buildCurrentRecord() {
  const typeConfig = interviewTypes[interviewStore.interviewType]
  return {
    typeLabel: typeConfig?.label || interviewStore.customSource || '面试记录',
    customSource: interviewStore.customSource,
    finishedAt: new Date().toISOString(),
    totalScore: interviewStore.totalScore,
    questions: interviewStore.questions,
    answers: interviewStore.answers,
    scores: interviewStore.scores,
    conversations: interviewStore.conversations,
  }
}

function handleExport(format) {
  exportFormat.value = format
  exportRecords([buildCurrentRecord()], format)
  showExportMenu.value = false
}

function handleExportBackdropClick(e) {
  if (e.target === e.currentTarget) showExportMenu.value = false
}
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <!-- 选择面试类型 -->
    <div
      v-if="interviewStore.phase === 'idle'"
      class="flex flex-1 justify-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-10 thin-scrollbar"
    >
      <div class="w-full max-w-lg">
        <div class="mb-6 sm:mb-8 text-center">
          <div
            class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted sm:mb-4 sm:h-16 sm:w-16"
          >
            <Icon icon="lucide:presentation" class="h-7 w-7 text-primary sm:h-8 sm:w-8" />
          </div>
          <h1 class="text-lg font-semibold text-text-primary sm:text-xl">AI 面试</h1>
          <p class="mt-1.5 text-xs text-text-secondary sm:mt-2 sm:text-sm">
            选择面试类型，AI 将模拟真实面试场景帮助你练习
          </p>
        </div>

        <!-- 标签切换 -->
        <div role="tablist" class="flex gap-0.5 rounded-xl bg-surface-input p-1 sm:gap-1">
          <button
            v-for="tab in [
              { key: 'bank', label: '题库出题', icon: 'lucide:library' },
              { key: 'file', label: '文件出题', icon: 'lucide:file-up' },
              { key: 'knowledge', label: '知识库出题', icon: 'lucide:database' },
            ]"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            class="flex-1 flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-xs font-medium transition-all duration-200 sm:gap-1.5 sm:px-3 sm:text-sm"
            :class="
              activeTab === tab.key
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            "
            @click="switchTab(tab.key)"
          >
            <Icon :icon="tab.icon" class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {{ tab.label }}
          </button>
        </div>

        <!-- 题库模式 -->
        <template v-if="activeTab === 'bank'">
          <!-- 自定义岗位输入 -->
          <div class="mt-4">
            <label class="mb-2 block text-xs font-medium text-text-secondary"
              >输入目标岗位，AI 自动生成面试题</label
            >
            <div class="flex gap-2">
              <input
                v-model="customRole"
                type="text"
                class="flex-1 rounded-xl border border-border bg-surface-input px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors duration-200"
                placeholder="例如：Java 后端开发、产品经理、数据分析..."
                maxlength="50"
                @keydown="onRoleKeydown"
              />
              <button
                type="button"
                class="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-40"
                :disabled="!customRole.trim()"
                @click="selectCustomRole"
              >
                确认
              </button>
            </div>
            <!-- 岗位错误提示 -->
            <div
              v-if="roleError"
              class="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500"
            >
              <div class="flex items-start gap-2">
                <Icon icon="lucide:alert-circle" class="mt-0.5 h-4 w-4 shrink-0" />
                <p>{{ roleError }}</p>
              </div>
            </div>
          </div>

          <!-- 或选择前端预设 -->
          <div v-if="typeOptions.length" class="mt-4">
            <div class="relative mb-3">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-border"></div>
              </div>
              <div class="relative flex justify-center">
                <span class="bg-background px-3 text-xs text-text-muted">或选择前端预设</span>
              </div>
            </div>
            <div class="space-y-2.5">
              <button
                v-for="opt in typeOptions"
                :key="opt.key"
                type="button"
                class="w-full rounded-2xl border p-4 text-left transition-all duration-200"
                :class="
                  selectedType === opt.key
                    ? 'border-primary bg-primary-muted/50 ring-1 ring-primary'
                    : 'border-border bg-surface-elevated hover:border-primary/30 hover:bg-surface'
                "
                @click="selectType(opt.key)"
              >
                <div class="text-sm font-semibold text-text-primary">{{ opt.label }}</div>
                <div class="mt-1 text-xs text-text-muted">{{ opt.description }}</div>
              </button>
            </div>
          </div>
        </template>

        <!-- 文件模式 -->
        <template v-if="activeTab === 'file'">
          <!-- 文件上传区域（未上传时） -->
          <div
            v-if="!uploadedFile && !isParsing"
            role="button"
            tabindex="0"
            aria-label="点击上传文件"
            class="mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-center transition-all duration-200 hover:border-primary/50 hover:bg-surface-input/50 sm:px-6 sm:py-10"
            @click="triggerFileSelect"
            @keydown.enter="triggerFileSelect"
            @keydown.space.prevent="triggerFileSelect"
          >
            <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-muted">
              <Icon icon="lucide:upload" class="h-7 w-7 text-primary" />
            </div>
            <div>
              <p class="text-sm font-medium text-text-primary">点击上传文件</p>
              <p class="mt-1 text-xs text-text-muted">
                支持 PDF / Word / TXT，基于文件内容 AI 生成面试题
              </p>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept=".pdf,.docx,.txt,.md,.json,.csv"
              class="hidden"
              @change="handleFileUpload"
            />
          </div>

          <!-- 解析中 -->
          <div
            v-if="isParsing"
            class="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-6 py-10 text-center"
          >
            <div
              class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            <p class="text-sm text-text-muted">正在解析文件...</p>
          </div>

          <!-- 文件信息 + 预览（上传成功后） -->
          <div v-if="uploadedFile && !fileError" class="mt-4 space-y-3">
            <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Icon icon="lucide:file-text" class="h-5 w-5 text-emerald-500" />
                  <div>
                    <p class="text-sm font-medium text-text-primary">{{ uploadedFile.name }}</p>
                    <p class="text-xs text-text-muted">
                      {{
                        uploadedFile.type === 'pdf'
                          ? 'PDF'
                          : uploadedFile.type === 'word'
                            ? 'Word'
                            : '文本'
                      }}
                      &middot; {{ uploadedFile.text.length }} 字
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                  @click="removeUploadedFile"
                >
                  <Icon icon="lucide:x" class="h-4 w-4" />
                </button>
              </div>
              <!-- 内容预览 -->
              <div
                class="mt-3 max-h-32 overflow-y-auto rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted"
              >
                {{ uploadedFile.text.slice(0, 500)
                }}{{ uploadedFile.text.length > 500 ? '...' : '' }}
              </div>
            </div>
          </div>

          <!-- 错误提示 -->
          <div
            v-if="fileError"
            class="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500"
          >
            <div class="flex items-start gap-2">
              <Icon icon="lucide:alert-circle" class="mt-0.5 h-4 w-4 shrink-0" />
              <p>{{ fileError }}</p>
            </div>
          </div>
        </template>

        <!-- 知识库模式 -->
        <template v-if="activeTab === 'knowledge'">
          <!-- 加载中 -->
          <div
            v-if="knowledgeStore.loading && knowledgeStore.kbs.length === 0"
            class="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-6 py-8 text-center"
          >
            <div
              class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            <p class="text-sm text-text-muted">加载知识库...</p>
          </div>

          <!-- 空状态：无知识库 -->
          <div
            v-else-if="knowledgeStore.kbs.length === 0"
            class="mt-4 rounded-2xl border border-dashed border-border px-6 py-10 text-center"
          >
            <div
              class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-muted"
            >
              <Icon icon="lucide:database" class="h-6 w-6 text-primary" />
            </div>
            <p class="text-sm font-medium text-text-primary">还没有知识库</p>
            <p class="mt-1 text-xs text-text-muted">先去知识库页面创建知识库并上传文档</p>
            <router-link
              to="/knowledge"
              class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Icon icon="lucide:arrow-right" class="h-4 w-4" />
              前往知识库
            </router-link>
          </div>

          <!-- KB 选择列表 -->
          <div v-else class="mt-4 space-y-2.5">
            <p class="text-xs font-medium text-text-secondary">选择一个知识库</p>
            <button
              v-for="kb in knowledgeStore.kbs"
              :key="kb.id"
              type="button"
              class="w-full rounded-2xl border p-4 text-left transition-all duration-200"
              :class="
                selectedKBId === kb.id
                  ? 'border-primary bg-primary-muted/50 ring-1 ring-primary'
                  : 'border-border bg-surface-elevated hover:border-primary/30 hover:bg-surface'
              "
              @click="selectKB(kb.id)"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted"
                >
                  <Icon icon="lucide:folder" class="h-4 w-4 text-primary" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-text-primary truncate">{{ kb.name }}</div>
                  <div class="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                    <span>{{ kb.fileCount || 0 }} 个文件</span>
                    <span v-if="kb.description" class="truncate">{{ kb.description }}</span>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <!-- 错误提示 -->
          <div
            v-if="kbError"
            class="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500"
          >
            <div class="flex items-start gap-2">
              <Icon icon="lucide:alert-circle" class="mt-0.5 h-4 w-4 shrink-0" />
              <p>{{ kbError }}</p>
            </div>
          </div>
        </template>

        <!-- 题数和难度设置（三种模式共享） -->
        <div
          v-if="
            (activeTab === 'bank' && selectedType) ||
            (activeTab === 'file' && uploadedFile) ||
            (activeTab === 'knowledge' && selectedKBId)
          "
          class="mt-5 space-y-4 animate-fade-in"
        >
          <div>
            <label class="mb-2 block text-xs font-medium text-text-secondary">题目数量</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="n in countPresets"
                :key="n"
                type="button"
                class="rounded-lg border px-3 py-2 text-sm transition-all duration-200"
                :class="
                  !isCustomCount && questionCount === n
                    ? 'border-primary bg-primary-muted/50 text-primary'
                    : 'border-border text-text-secondary hover:border-primary/30'
                "
                @click="selectCountPreset(n)"
              >
                {{ n }} 题
              </button>
              <!-- 自定义 -->
              <template v-if="isCustomCount">
                <input
                  ref="countInputRef"
                  v-model="customCountInput"
                  type="number"
                  min="1"
                  :max="MAX_QUESTIONS"
                  class="w-20 rounded-lg border border-primary bg-primary-muted/30 px-3 py-2 text-center text-sm text-text-primary focus:outline-none"
                  @blur="applyCustomCount"
                  @keydown="onCustomKeydown"
                />
              </template>
              <button
                v-else
                type="button"
                class="rounded-lg border px-3 py-2 text-sm transition-all duration-200"
                :class="
                  !countPresets.includes(questionCount)
                    ? 'border-primary bg-primary-muted/50 text-primary'
                    : 'border-dashed border-border text-text-muted hover:border-primary/30 hover:text-text-secondary'
                "
                @click="enableCustomCount"
              >
                自定义{{ !countPresets.includes(questionCount) ? ` (${questionCount}题)` : '' }}
              </button>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-xs font-medium text-text-secondary">难度选择</label>
            <div class="flex gap-2">
              <button
                v-for="d in difficultyOptions"
                :key="d.value"
                type="button"
                :aria-pressed="difficulty === d.value"
                :aria-label="`难度：${d.label}`"
                class="flex-1 rounded-lg border px-3 py-2 text-center text-sm transition-all duration-200"
                :class="
                  difficulty === d.value
                    ? 'border-primary bg-primary-muted/50 text-primary'
                    : 'border-border text-text-secondary hover:border-primary/30'
                "
                @click="difficulty = d.value"
              >
                {{ d.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- 开始按钮 -->
        <div class="mt-6 flex justify-center">
          <!-- 题库模式：预设类型按钮 -->
          <button
            v-if="activeTab === 'bank' && !isCustomRole"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-40"
            :disabled="!selectedType"
            @click="startInterview"
          >
            <Icon icon="lucide:play" class="h-4 w-4" />
            开始模拟面试
          </button>
          <!-- 题库模式：自定义岗位按钮 -->
          <button
            v-if="activeTab === 'bank' && isCustomRole"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-40"
            :disabled="!selectedType || isRoleGenerating"
            @click="startRoleInterview"
          >
            <span
              v-if="isRoleGenerating"
              class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
            <Icon v-else icon="lucide:sparkles" class="h-4 w-4" />
            {{ isRoleGenerating ? '正在生成题目...' : '生成题目并开始面试' }}
          </button>
          <!-- 文件模式按钮 -->
          <button
            v-if="activeTab === 'file'"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-40"
            :disabled="!uploadedFile || isGenerating"
            @click="startFileInterview"
          >
            <span
              v-if="isGenerating"
              class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
            <Icon v-else icon="lucide:sparkles" class="h-4 w-4" />
            {{ isGenerating ? '正在生成题目...' : '生成题目并开始面试' }}
          </button>
          <!-- 知识库模式按钮 -->
          <button
            v-if="activeTab === 'knowledge'"
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-40"
            :disabled="!selectedKBId || isKBGenerating"
            @click="startKBInterview"
          >
            <span
              v-if="isKBGenerating"
              class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            />
            <Icon v-else icon="lucide:sparkles" class="h-4 w-4" />
            {{ isKBGenerating ? '正在生成题目...' : '生成题目并开始面试' }}
          </button>
        </div>

        <div class="mt-6 text-center">
          <button
            type="button"
            class="text-sm text-text-muted transition-colors hover:text-text-secondary"
            @click="goToChat"
          >
            返回 AI 对话
          </button>
        </div>
      </div>
    </div>

    <!-- 面试进行中 -->
    <InterviewSession
      v-if="
        interviewStore.phase === 'answering' ||
        interviewStore.phase === 'scoring' ||
        interviewStore.phase === 'feedback'
      "
      @quit="backToHome"
    />

    <!-- 面试结果 -->
    <div v-if="interviewStore.phase === 'finished'" class="flex-1 overflow-y-auto thin-scrollbar">
      <div class="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <!-- 总分大卡片 -->
        <div
          class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5 text-center sm:mb-8 sm:p-8"
        >
          <div
            class="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full"
            :class="getScoreBg(resultStats.totalScore)"
          >
            <span class="text-3xl font-bold" :class="getScoreColor(resultStats.totalScore)"
              >{{ resultStats.totalScore
              }}<span class="text-base font-normal text-text-muted">/10</span></span
            >
          </div>
          <h2 class="text-lg font-semibold text-text-primary">面试完成</h2>
          <p class="mt-1 text-sm text-text-muted">
            {{
              resultStats.totalScore >= 8
                ? '表现优秀！继续保持！'
                : resultStats.totalScore >= 5
                  ? '表现不错，还有提升空间'
                  : '还需要多加练习，加油！'
            }}
          </p>
        </div>

        <!-- 分类得分 -->
        <div
          v-if="Object.keys(resultStats.categoryStats).length"
          class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5"
        >
          <h3 class="mb-3 text-sm font-semibold text-text-primary">分类得分</h3>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div
              v-for="(score, cat) in resultStats.categoryStats"
              :key="cat"
              class="rounded-xl border border-border bg-surface p-3 text-center"
            >
              <div class="text-sm text-text-secondary capitalize">{{ cat }}</div>
              <div class="mt-1 text-lg font-semibold" :class="getScoreColor(score)">
                {{ score }}
              </div>
            </div>
          </div>
        </div>

        <!-- 逐题回顾 -->
        <div class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
          <h3 class="mb-3 text-sm font-semibold text-text-primary">题目回顾</h3>
          <div class="space-y-3">
            <div
              v-for="(q, idx) in resultStats.questions"
              :key="q.id"
              class="rounded-xl border border-border bg-surface p-4"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-text-muted">Q{{ idx + 1 }}</span>
                <span class="text-sm text-text-primary truncate">{{ q.question }}</span>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <span class="text-text-muted">得分：</span>
                <span
                  class="font-semibold"
                  :class="getScoreColor(resultStats.scores[q.id]?.score || 0)"
                >
                  {{ resultStats.scores[q.id]?.score || '-' }}
                </span>
                <span v-if="resultStats.scores[q.id]?.feedback" class="truncate text-text-muted">
                  {{ resultStats.scores[q.id]?.feedback }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 薄弱点 -->
        <div
          v-if="resultStats.weakPoints.length"
          class="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5"
        >
          <h3 class="mb-3 text-sm font-semibold text-text-primary">需要加强的知识点</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="wp in resultStats.weakPoints"
              :key="wp.knowledgePoint"
              class="rounded-full border border-amber-500/20 bg-surface px-3 py-1 text-xs text-text-secondary"
            >
              {{ wp.knowledgePoint }}（{{ wp.score }} 分）
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-col items-center gap-3 pb-8">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90"
            @click="backToHome"
          >
            <Icon icon="lucide:rotate-cw" class="h-4 w-4" />
            再来一次
          </button>
          <!-- 导出按钮 -->
          <div class="relative">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary"
              @click="showExportMenu = !showExportMenu"
            >
              <Icon icon="lucide:download" class="h-4 w-4" />
              导出本次面试
            </button>
            <Teleport to="body">
              <div
                v-if="showExportMenu"
                class="fixed inset-0 z-[999]"
                @click="handleExportBackdropClick"
              />
            </Teleport>
            <Transition name="export-menu">
              <div
                v-if="showExportMenu"
                class="absolute left-1/2 top-full z-[1001] mt-1 -translate-x-1/2"
              >
                <div
                  class="overflow-hidden rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
                >
                  <button
                    type="button"
                    class="block w-full rounded-lg px-4 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary whitespace-nowrap"
                    @click="handleExport('md')"
                  >
                    Markdown (.md)
                  </button>
                  <button
                    type="button"
                    class="block w-full rounded-lg px-4 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary whitespace-nowrap"
                    @click="handleExport('txt')"
                  >
                    纯文本 (.txt)
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <div class="flex items-center gap-1.5 text-xs text-text-muted">
            <Icon icon="lucide:lightbulb" class="h-3.5 w-3.5 shrink-0" />
            去 AI 对话中引用面试记录，分析薄弱点
          </div>
          <button
            type="button"
            class="text-sm text-text-muted transition-colors hover:text-text-secondary"
            @click="goToChat"
          >
            返回 AI 对话
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-menu-enter-active,
.export-menu-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.export-menu-enter-from,
.export-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
</style>
