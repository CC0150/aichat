<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useInterviewStore } from '@/stores/interview'
import { useAppStore } from '@/stores/app'
import { requestScore, requestEvaluate } from '@/utils/interviewApi'

const emit = defineEmits(['quit'])
const interviewStore = useInterviewStore()
const appStore = useAppStore()

const userAnswer = ref('')
const codeAnswer = ref('')
const isScoring = ref(false)
const scoreError = ref('')
const textareaRef = ref(null)
const codeAreaRef = ref(null)
const isCodingQuestion = ref(false)
const draftAnswers = reactive({})
const followUpQuestion = ref('')
const currentRound = ref(0)
const useDeepMode = ref(true)    // 默认启用深度追问模式

const MAX_FOLLOW_UP_ROUNDS = 3

/** 当前题目的对话轮次（追问次数） */
const conversationRounds = computed(() =>
  Math.floor((interviewStore.conversations[interviewStore.currentQuestion?.id]?.length || 0) / 2)
)

function handleQuit() {
  userAnswer.value = ''
  codeAnswer.value = ''
  scoreError.value = ''
  followUpQuestion.value = ''
  currentRound.value = 0
  emit('quit')
}

/** 将组合格式的答案拆分为代码和文字 */
function parseStoredAnswer(raw) {
  if (!raw) return { code: '', text: '' }
  const codeMatch = raw.match(/^\[代码\]\n([\s\S]*?)\n\n\[文字说明\]\n([\s\S]*)$/)
  if (codeMatch) {
    return { code: codeMatch[1], text: codeMatch[2] }
  }
  // 无法解析时，全部放进代码区
  return { code: raw, text: '' }
}

/** 保存当前题目的草稿 */
function saveDraft(qId) {
  if (!qId) return
  const hasDraft = (isCodingQuestion.value && codeAnswer.value.trim()) || userAnswer.value.trim()
  if (!hasDraft) return
  if (isCodingQuestion.value) {
    draftAnswers[qId] = { c: codeAnswer.value, t: userAnswer.value }
  } else {
    draftAnswers[qId] = userAnswer.value
  }
}

/** 恢复题目答案 */
function restoreDraft(qId) {
  const draft = draftAnswers[qId]
  const stored = interviewStore.answers[qId]
  const source = draft !== undefined ? draft : stored

  if (isCodingQuestion.value) {
    if (source && typeof source === 'object' && 'c' in source) {
      codeAnswer.value = source.c || ''
      userAnswer.value = source.t || ''
    } else if (typeof source === 'string' && source) {
      const parsed = parseStoredAnswer(source)
      codeAnswer.value = parsed.code
      userAnswer.value = parsed.text
    } else {
      codeAnswer.value = ''
      userAnswer.value = ''
    }
  } else {
    userAnswer.value = (typeof source === 'string' ? source : '') || ''
  }
}

// 题目切换时恢复答案和追问状态
watch(() => interviewStore.currentQuestion, (q, oldQ) => {
  saveDraft(oldQ?.id)
  scoreError.value = ''
  isCodingQuestion.value = q?.type === 'coding'
  if (q) {
    restoreDraft(q.id)
    // 恢复追问状态
    const conv = interviewStore.conversations[q.id] || []
    if (conv.length > 0 && !interviewStore.scores[q.id]) {
      // 有对话记录且未完成 → 从最后一条 assistant 消息获取追问
      const lastAssistant = [...conv].reverse().find((m) => m.role === 'assistant')
      followUpQuestion.value = lastAssistant?.content || ''
      currentRound.value = Math.floor(conv.length / 2)
    } else {
      followUpQuestion.value = ''
      currentRound.value = 0
    }
  } else {
    userAnswer.value = ''
    codeAnswer.value = ''
    followUpQuestion.value = ''
    currentRound.value = 0
  }
}, { immediate: true })

// 跳转到指定题目
function handleGoToQuestion(index) {
  if (isScoring.value) return
  saveDraft(interviewStore.currentQuestion?.id)
  interviewStore.goToQuestion(index)
}

// 题目状态
function getQuestionStatus(index) {
  const q = interviewStore.questions[index]
  if (!q) return 'unanswered'
  if (index === interviewStore.currentIndex) return 'current'
  if (interviewStore.scores[q.id]) return 'scored'
  if (interviewStore.conversations[q.id]?.length) return 'draft'
  if (draftAnswers[q.id] || interviewStore.answers[q.id]) return 'draft'
  return 'unanswered'
}

async function handleSubmit() {
  const q = interviewStore.currentQuestion
  if (!q || isScoring.value) return

  let answer
  if (isCodingQuestion.value) {
    const code = codeAnswer.value.trim()
    const text = userAnswer.value.trim()
    if (!code && !text) return
    answer = [`[代码]\n${code || '(未编写代码)'}`, `[文字说明]\n${text || '(未填写说明)'}`].join('\n\n')
  } else {
    answer = userAnswer.value.trim()
    if (!answer) return
  }


  if (useDeepMode.value) {
    // 深度追问模式
    interviewStore.submitAnswer(q.id, answer, true)
    isScoring.value = true
    scoreError.value = ''

    try {
      const conversationHistory = interviewStore.conversations[q.id] || []
      const result = await requestEvaluate({
        question: q.question,
        answerPoints: q.answerPoints,
        conversationHistory,
        model: appStore.currentModelId,
      })

      const action = interviewStore.handleEvaluateResult(q.id, result)

      if (action === 'follow_up') {
        followUpQuestion.value = result.followUpQuestion
        currentRound.value++
        userAnswer.value = ''
        codeAnswer.value = ''
      } else {
        // complete
        followUpQuestion.value = ''
        currentRound.value = 0
      }
      delete draftAnswers[q.id]
    } catch (err) {
      scoreError.value = err.message || '评估失败'
      // 降级为直接完成
      interviewStore.saveScore(q.id, {
        score: 5,
        correctness: 5,
        completeness: 5,
        clarity: 5,
        feedback: `评估服务异常：${err.message}。已为你生成默认评分。`,
        improvedAnswer: '',
      })
      followUpQuestion.value = ''
      currentRound.value = 0
    } finally {
      isScoring.value = false
    }
  } else {
    // 普通评分模式（保留向后兼容）
    interviewStore.submitAnswer(q.id, answer, false)
    isScoring.value = true
    scoreError.value = ''

    try {
      const result = await requestScore({
        question: q.question,
        answerPoints: q.answerPoints,
        userAnswer: answer,
        model: appStore.currentModelId,
      })
      interviewStore.saveScore(q.id, result)
    } catch (err) {
      scoreError.value = err.message || '评分失败'
      interviewStore.saveScore(q.id, {
        score: 5,
        correctness: 5,
        completeness: 5,
        clarity: 5,
        feedback: `评分服务异常：${err.message}。以下为默认评分，请重新提交或稍后重试。`,
        improvedAnswer: '',
      })
    } finally {
      isScoring.value = false
    }
  }
}

function handleNext() {
  userAnswer.value = ''
  codeAnswer.value = ''
  scoreError.value = ''
  followUpQuestion.value = ''
  currentRound.value = 0
  interviewStore.nextQuestion()
}

function handleKeydown(e) {
  if (isCodingQuestion.value && e.key === 'Tab') {
    e.preventDefault()
    const ta = codeAreaRef.value
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    codeAnswer.value = codeAnswer.value.slice(0, start) + '  ' + codeAnswer.value.slice(end)
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2
    })
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    if (interviewStore.phase === 'answering') {
      handleSubmit()
    } else if (interviewStore.phase === 'feedback') {
      handleNext()
    }
  }
}
</script>

<template>
  <div class="flex h-full flex-col" @keydown="handleKeydown">
    <!-- 进度条 -->
    <div class="shrink-0 border-b border-border bg-surface px-3 py-2.5 sm:px-6 sm:py-3">
      <div class="mb-1.5 flex items-center justify-between text-xs text-text-muted">
        <span>第 {{ interviewStore.progress.current }} / {{ interviewStore.progress.total }} 题</span>
        <div class="flex items-center gap-3">
          <span>{{ interviewStore.progress.percentage }}%</span>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
            @click="handleQuit"
          >
            退出答题
          </button>
        </div>
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
        <div
          class="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          :style="{ width: interviewStore.progress.percentage + '%' }"
        />
      </div>
    </div>

    <!-- 题号导航 -->
    <div class="shrink-0 border-b border-border bg-surface px-3 py-2 sm:px-6 sm:py-2.5">
      <div class="flex items-center gap-1 overflow-x-auto thin-scrollbar sm:gap-1.5">
        <button
          v-for="(_, idx) in interviewStore.questions"
          :key="idx"
          type="button"
          class="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-200 sm:px-3"
          :class="{
            'bg-primary text-white shadow-sm': getQuestionStatus(idx) === 'current',
            'bg-emerald-500/10 text-emerald-500': getQuestionStatus(idx) === 'scored',
            'bg-amber-500/10 text-amber-500': getQuestionStatus(idx) === 'draft',
            'bg-surface-input text-text-muted hover:bg-surface-input/70 hover:text-text-secondary': getQuestionStatus(idx) === 'unanswered',
          }"
          :disabled="isScoring"
          @click="handleGoToQuestion(idx)"
        >
          <Icon
            v-if="getQuestionStatus(idx) === 'scored'"
            icon="lucide:check-circle"
            class="h-3.5 w-3.5"
          />
          <span>Q{{ idx + 1 }}</span>
        </button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="flex-1 overflow-y-auto px-4 py-5 thin-scrollbar sm:px-6 sm:py-6">
      <div class="mx-auto max-w-3xl">
        <!-- 题目元信息 -->
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span
            class="rounded-full px-2.5 py-0.5 text-xs font-medium"
            :class="{
              'bg-emerald-500/10 text-emerald-500': interviewStore.currentQuestion?.difficulty === 'easy',
              'bg-amber-500/10 text-amber-500': interviewStore.currentQuestion?.difficulty === 'medium',
              'bg-red-500/10 text-red-500': interviewStore.currentQuestion?.difficulty === 'hard',
            }"
          >
            {{ interviewStore.currentQuestion?.difficulty === 'easy' ? '简单' : interviewStore.currentQuestion?.difficulty === 'medium' ? '中等' : '困难' }}
          </span>
          <span
            v-for="tag in interviewStore.currentQuestion?.tags"
            :key="tag"
            class="rounded-full bg-surface-input px-2.5 py-0.5 text-xs text-text-secondary"
          >{{ tag }}</span>
        </div>

        <!-- 题目文字 -->
        <h2 class="mb-6 text-lg leading-relaxed text-text-primary">
          {{ interviewStore.currentQuestion?.question }}
        </h2>

        <!-- 多轮对话历史 -->
        <div
          v-if="interviewStore.currentConversation.length > 0"
          class="mb-5 space-y-3"
        >
          <div
            v-for="(msg, mi) in interviewStore.currentConversation"
            :key="mi"
            class="flex"
            :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <div
              class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              :class="msg.role === 'user'
                ? 'bg-primary/10 text-text-primary border border-primary/15'
                : 'bg-surface-input text-text-secondary border border-border'"
            >
              <div class="mb-1 flex items-center gap-1.5 text-xs font-medium" :class="msg.role === 'user' ? 'text-primary' : 'text-text-muted'">
                <Icon
                  :icon="msg.role === 'user' ? 'lucide:user' : 'lucide:bot'"
                  class="h-3 w-3"
                />
                <span>{{ msg.role === 'user' ? '你的回答' : `AI 追问 (第${Math.ceil((mi + 1) / 2)}轮)` }}</span>
              </div>
              <p>{{ msg.content }}</p>
            </div>
          </div>
        </div>

        <!-- 追问指示器 -->
        <div
          v-if="followUpQuestion && interviewStore.phase === 'answering'"
          class="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
        >
          <Icon icon="lucide:sparkles" class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div class="text-sm">
            <span class="font-medium text-amber-500">AI 追问（第 {{ currentRound }}/{{ MAX_FOLLOW_UP_ROUNDS }} 轮）</span>
            <p class="mt-1 text-text-secondary">{{ followUpQuestion }}</p>
          </div>
        </div>

        <!-- 输入 / 提示区域 -->
        <div v-if="interviewStore.phase === 'answering' || interviewStore.phase === 'scoring'">
          <!-- 代码题：代码编辑器 + 文字说明 -->
          <template v-if="isCodingQuestion">
            <label class="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Icon icon="lucide:code-2" class="h-4 w-4" />
              编写代码
            </label>
            <div class="overflow-hidden rounded-xl border border-border bg-[#0d1117] transition-colors duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-muted">
              <div class="flex items-center justify-between border-b border-white/5 px-4 py-2">
                <div class="flex items-center gap-1.5">
                  <span class="h-3 w-3 rounded-full bg-red-500/80" />
                  <span class="h-3 w-3 rounded-full bg-amber-500/80" />
                  <span class="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span class="text-xs text-white/30">JavaScript</span>
              </div>
              <div class="flex">
                <div class="select-none shrink-0 py-3 pl-4 pr-2 text-right font-mono text-xs leading-relaxed text-white/20">
                  <template v-for="i in Math.max(codeAnswer.split('\n').length, 6)" :key="i">
                    {{ i }}<br />
                  </template>
                </div>
                <textarea
                  ref="codeAreaRef"
                  v-model="codeAnswer"
                  class="min-h-[130px] flex-1 resize-none border-0 bg-transparent py-3 pl-2 pr-4 font-mono text-sm leading-relaxed text-[#c9d1d9] placeholder:text-white/20 focus:outline-none sm:min-h-[160px]"
                  placeholder="// 在此编写你的代码...
          // 例如：
          function solution() {
            // your code here
          }"
                  spellcheck="false"
                  :disabled="interviewStore.phase === 'scoring'"
                />
              </div>
            </div>

            <!-- 代码题的文字说明区 -->
            <label class="mb-2 mt-5 flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Icon icon="lucide:file-text" class="h-4 w-4" />
              文字说明
            </label>
            <textarea
              v-model="userAnswer"
              class="w-full resize-none rounded-xl border border-border bg-surface-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted"
              rows="4"
              placeholder="补充说明：如应用场景、设计思路、复杂度分析等..."
              :disabled="interviewStore.phase === 'scoring'"
            />
          </template>

          <!-- 概念 / 场景题：普通文本域 -->
          <template v-else>
            <label class="mb-2 block text-sm font-medium text-text-secondary">你的回答</label>
            <textarea
              ref="textareaRef"
              v-model="userAnswer"
              class="w-full resize-none rounded-xl border border-border bg-surface-input px-4 py-3 text-sm text-text-primary placeholder:text-text-muted transition-colors duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted"
              rows="5"
              placeholder="请输入你的回答...  (Ctrl+Enter 提交)"
              :disabled="interviewStore.phase === 'scoring'"
            />
          </template>

          <div class="mt-3 flex items-center justify-between gap-2">
            <span class="hidden text-xs text-text-muted sm:inline">{{ (codeAnswer.length + userAnswer.length) }} 字符</span>
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
              :disabled="(!codeAnswer.trim() && !userAnswer.trim()) || isScoring"
              @click="handleSubmit"
            >
              <span v-if="isScoring" class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span v-else-if="currentRound > 0">补充回答（第 {{ currentRound }}/{{ MAX_FOLLOW_UP_ROUNDS }} 轮）</span>
              <span v-else>提交回答</span>
            </button>
          </div>
        </div>

        <!-- 评分反馈 -->
        <div v-if="interviewStore.phase === 'feedback'" class="space-y-4 animate-fade-in">
          <!-- 对话回顾 -->
          <div
            v-if="interviewStore.currentConversation.length > 0"
            class="rounded-2xl border border-border bg-surface-elevated p-4"
          >
            <h3 class="mb-3 text-sm font-semibold text-text-primary">对话回顾</h3>
            <div class="space-y-2.5">
              <div
                v-for="(msg, mi) in interviewStore.currentConversation"
                :key="mi"
                class="flex"
                :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
              >
                <div
                  class="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
                  :class="msg.role === 'user'
                    ? 'bg-primary/10 text-text-primary'
                    : 'bg-surface-input text-text-secondary'"
                >
                  <span class="font-medium">{{ msg.role === 'user' ? '你' : 'AI' }}</span>
                  <p class="mt-0.5">{{ msg.content }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- 评分卡片 -->
          <div class="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <h3 class="mb-4 text-sm font-semibold text-text-primary">评分结果</h3>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="text-center">
                <div class="text-2xl font-bold text-primary">
                  <template v-if="interviewStore.scores[interviewStore.currentQuestion?.id]?.score != null">
                    {{ interviewStore.scores[interviewStore.currentQuestion?.id]?.score }}<span class="text-sm font-normal text-text-muted">/10</span>
                  </template>
                  <template v-else>-</template>
                </div>
                <div class="mt-1 text-xs text-text-muted">总分</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-semibold text-text-primary">
                  <template v-if="interviewStore.scores[interviewStore.currentQuestion?.id]?.correctness != null">
                    {{ interviewStore.scores[interviewStore.currentQuestion?.id]?.correctness }}<span class="text-xs font-normal text-text-muted">/10</span>
                  </template>
                  <template v-else>-</template>
                </div>
                <div class="mt-1 text-xs text-text-muted">正确性</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-semibold text-text-primary">
                  <template v-if="interviewStore.scores[interviewStore.currentQuestion?.id]?.completeness != null">
                    {{ interviewStore.scores[interviewStore.currentQuestion?.id]?.completeness }}<span class="text-xs font-normal text-text-muted">/10</span>
                  </template>
                  <template v-else>-</template>
                </div>
                <div class="mt-1 text-xs text-text-muted">完整性</div>
              </div>
              <div class="text-center">
                <div class="text-lg font-semibold text-text-primary">
                  <template v-if="interviewStore.scores[interviewStore.currentQuestion?.id]?.clarity != null">
                    {{ interviewStore.scores[interviewStore.currentQuestion?.id]?.clarity }}<span class="text-xs font-normal text-text-muted">/10</span>
                  </template>
                  <template v-else>-</template>
                </div>
                <div class="mt-1 text-xs text-text-muted">清晰度</div>
              </div>
            </div>
          </div>

          <!-- AI 评价 -->
          <div v-if="interviewStore.scores[interviewStore.currentQuestion?.id]?.feedback" class="rounded-2xl border border-border bg-surface-elevated p-5">
            <h3 class="mb-2 text-sm font-semibold text-text-primary">AI 点评</h3>
            <p class="text-sm leading-relaxed text-text-secondary">
              {{ interviewStore.scores[interviewStore.currentQuestion?.id]?.feedback }}
            </p>
          </div>

          <!-- 参考答案 -->
          <div v-if="interviewStore.scores[interviewStore.currentQuestion?.id]?.improvedAnswer" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 class="mb-2 text-sm font-semibold text-emerald-500">参考回答</h3>
            <p class="text-sm leading-relaxed text-text-secondary">
              {{ interviewStore.scores[interviewStore.currentQuestion?.id]?.improvedAnswer }}
            </p>
          </div>

          <div v-if="scoreError" class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-500">
            {{ scoreError }}
          </div>

          <div class="flex justify-end pt-2">
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 sm:w-auto"
              @click="handleNext"
            >
              {{ interviewStore.isLastQuestion ? '查看结果' : '下一题' }}
              <Icon icon="lucide:arrow-right" class="h-4 w-4" />
            </button>
          </div>
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
.thin-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
