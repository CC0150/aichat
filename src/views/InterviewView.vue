<script setup>
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useInterviewStore } from '@/stores/interview'
import { interviewTypes } from '@/data/questions/index.js'
import InterviewSession from '@/components/interview/InterviewSession.vue'

const router = useRouter()
const interviewStore = useInterviewStore()

const selectedType = ref(null)
const questionCount = ref(5)
const difficulty = ref("all")

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
  { value: "all", label: "混合" },
  { value: "easy", label: "简单" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "困难" },
]

function selectType(key) {
  selectedType.value = key
  const type = interviewTypes[key]
  if (type) {
    questionCount.value = type.questionCount
  }
}

function startInterview() {
  if (!selectedType.value) return
  interviewStore.startInterview(selectedType.value, questionCount.value, difficulty.value)
}

// 页面挂载时修复可能的不一致状态
onMounted(() => {
  if (interviewStore.phase !== 'idle' && interviewStore.phase !== 'finished' && !interviewStore.currentQuestion) {
    interviewStore.resetInterview()
  }
})

function backToHome() {
  interviewStore.resetInterview()
  selectedType.value = null
  questionCount.value = 5
  difficulty.value = "all"
}

function goToChat() {
  router.push({ name: 'Chat' })
}

// 结束后的统计
const resultStats = () => ({
  totalScore: interviewStore.totalScore,
  categoryStats: interviewStore.categoryStats,
  weakPoints: interviewStore.weakPoints,
  questions: interviewStore.questions,
  scores: interviewStore.scores,
})

function getScoreColor(score) {
  if (score >= 8) return 'text-emerald-500'
  if (score >= 5) return 'text-amber-500'
  return 'text-red-500'
}

function getScoreBg(score) {
  if (score >= 8) return 'bg-emerald-500/10'
  if (score >= 5) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <!-- 选择面试类型 -->
    <div v-if="interviewStore.phase === 'idle'" class="flex flex-1 justify-center overflow-y-auto px-6 py-10 thin-scrollbar">
      <div class="w-full max-w-lg">
        <div class="mb-8 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted">
            <Icon icon="lucide:presentation" class="h-8 w-8 text-primary" />
          </div>
          <h1 class="text-xl font-semibold text-text-primary">AI 面试教练</h1>
          <p class="mt-2 text-sm text-text-secondary">选择面试类型，AI 将模拟真实面试场景帮助你练习</p>
        </div>

        <div class="space-y-3">
          <button
            v-for="opt in typeOptions"
            :key="opt.key"
            type="button"
            class="w-full rounded-2xl border p-4 text-left transition-all duration-200"
            :class="selectedType === opt.key
              ? 'border-primary bg-primary-muted/50 ring-1 ring-primary'
              : 'border-border bg-surface-elevated hover:border-primary/30 hover:bg-surface'"
            @click="selectType(opt.key)"
          >
            <div class="text-sm font-semibold text-text-primary">{{ opt.label }}</div>
            <div class="mt-1 text-xs text-text-muted">{{ opt.description }}</div>
          </button>
        </div>

        <!-- 题数和难度设置 -->
        <div v-if="selectedType" class="mt-5 space-y-4 animate-fade-in">
          <div>
            <label class="mb-2 block text-xs font-medium text-text-secondary">题目数量</label>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="n in countPresets"
                :key="n"
                type="button"
                class="rounded-lg border px-3 py-2 text-sm transition-all duration-200"
                :class="!isCustomCount && questionCount === n
                  ? 'border-primary bg-primary-muted/50 text-primary'
                  : 'border-border text-text-secondary hover:border-primary/30'"
                @click="selectCountPreset(n)"
              >{{ n }} 题</button>
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
                class="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-text-muted transition-all duration-200 hover:border-primary/30 hover:text-text-secondary"
                @click="enableCustomCount"
              >自定义</button>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-xs font-medium text-text-secondary">难度选择</label>
            <div class="flex gap-2">
              <button
                v-for="d in difficultyOptions"
                :key="d.value"
                type="button"
                class="flex-1 rounded-lg border px-3 py-2 text-center text-sm transition-all duration-200"
                :class="difficulty === d.value
                  ? 'border-primary bg-primary-muted/50 text-primary'
                  : 'border-border text-text-secondary hover:border-primary/30'"
                @click="difficulty = d.value"
              >{{ d.label }}</button>
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-center">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-40"
            :disabled="!selectedType"
            @click="startInterview"
          >
            <Icon icon="lucide:play" class="h-4 w-4" />
            开始模拟面试
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
      v-if="interviewStore.phase === 'answering' || interviewStore.phase === 'scoring' || interviewStore.phase === 'feedback'"
      @quit="backToHome"
    />

    <!-- 面试结果 -->
    <div v-if="interviewStore.phase === 'finished'" class="flex-1 overflow-y-auto thin-scrollbar">
      <div class="mx-auto max-w-3xl px-6 py-8">
        <!-- 总分大卡片 -->
        <div class="mb-8 rounded-2xl border border-border bg-surface-elevated p-8 text-center">
          <div class="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full" :class="getScoreBg(resultStats().totalScore)">
            <span class="text-3xl font-bold" :class="getScoreColor(resultStats().totalScore)">{{ resultStats().totalScore }}<span class="text-base font-normal text-text-muted">/10</span></span>
          </div>
          <h2 class="text-lg font-semibold text-text-primary">面试完成</h2>
          <p class="mt-1 text-sm text-text-muted">
            {{ resultStats().totalScore >= 8 ? '表现优秀！继续保持！' : resultStats().totalScore >= 5 ? '表现不错，还有提升空间' : '还需要多加练习，加油！' }}
          </p>
        </div>

        <!-- 分类得分 -->
        <div v-if="Object.keys(resultStats().categoryStats).length" class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
          <h3 class="mb-3 text-sm font-semibold text-text-primary">分类得分</h3>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div
              v-for="(score, cat) in resultStats().categoryStats"
              :key="cat"
              class="rounded-xl border border-border bg-surface p-3 text-center"
            >
              <div class="text-sm text-text-secondary capitalize">{{ cat }}</div>
              <div class="mt-1 text-lg font-semibold" :class="getScoreColor(score)">{{ score }}</div>
            </div>
          </div>
        </div>

        <!-- 逐题回顾 -->
        <div class="mb-6 rounded-2xl border border-border bg-surface-elevated p-5">
          <h3 class="mb-3 text-sm font-semibold text-text-primary">题目回顾</h3>
          <div class="space-y-3">
            <div
              v-for="(q, idx) in resultStats().questions"
              :key="q.id"
              class="rounded-xl border border-border bg-surface p-4"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-text-muted">Q{{ idx + 1 }}</span>
                <span class="text-sm text-text-primary truncate">{{ q.question }}</span>
              </div>
              <div class="flex items-center gap-3 text-xs">
                <span class="text-text-muted">得分：</span>
                <span class="font-semibold" :class="getScoreColor(resultStats().scores[q.id]?.score || 0)">
                  {{ resultStats().scores[q.id]?.score || '-' }}
                </span>
                <span v-if="resultStats().scores[q.id]?.feedback" class="truncate text-text-muted">
                  {{ resultStats().scores[q.id]?.feedback }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 薄弱点 -->
        <div v-if="resultStats().weakPoints.length" class="mb-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h3 class="mb-3 text-sm font-semibold text-text-primary">需要加强的知识点</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="wp in resultStats().weakPoints"
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
          <div class="flex items-center gap-1.5 text-xs text-text-muted">
            <Icon icon="lucide:lightbulb" class="h-3.5 w-3.5" />
            去 AI 对话中点击
            <Icon icon="lucide:clipboard-list" class="h-3.5 w-3.5 text-primary" />
            引用本次面试记录，让 AI 帮你深入分析
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
.thin-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.thin-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.thin-scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
  transition: background 0.3s;
}
.thin-scrollbar:hover::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
}
.thin-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}
/* Firefox */
.thin-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
</style>
