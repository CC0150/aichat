<script setup>
import { Icon } from '@iconify/vue'
import ScoreBadge from './ScoreBadge.vue'
import ConversationThread from './ConversationThread.vue'

defineProps({
  question: { type: Object, required: true },
  score: { type: Object, default: null },
  answer: { type: String, default: '' },
  conversations: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
  showAnswer: { type: Boolean, default: true },
  showReferenceAnswer: { type: Boolean, default: true },
})

/** 难度标签映射 */
const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难' }
/** 难度颜色映射 */
const DIFFICULTY_CLASSES = {
  easy: 'bg-emerald-500/10 text-emerald-500',
  medium: 'bg-amber-500/10 text-amber-500',
  hard: 'bg-red-500/10 text-red-500',
}
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
    <!-- 题目头部：题号 + 难度 + 标签 + 总分 -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="text-sm font-semibold text-text-primary">Q{{ index + 1 }}</span>
      <span
        class="rounded-full px-2 py-0.5 text-xs font-medium"
        :class="DIFFICULTY_CLASSES[question.difficulty] || DIFFICULTY_CLASSES.medium"
      >
        {{ DIFFICULTY_LABELS[question.difficulty] || '中等' }}
      </span>
      <span
        v-for="tag in question.tags"
        :key="tag"
        class="rounded-full bg-surface-input px-2 py-0.5 text-xs text-text-secondary"
        >{{ tag }}</span
      >
      <div class="ml-auto">
        <ScoreBadge v-if="score" :score="score.score" size="sm" :show-denominator="true" />
      </div>
    </div>

    <!-- 题目文字 -->
    <p class="mb-4 text-sm leading-relaxed text-text-primary">{{ question.question }}</p>

    <!-- 用户回答 / 对话记录 -->
    <template v-if="showAnswer">
      <div v-if="conversations && conversations.length > 0" class="mb-4">
        <h4 class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
          <Icon icon="lucide:messages-square" class="h-3.5 w-3.5" />
          对话记录
        </h4>
        <ConversationThread :conversations="conversations" compact />
      </div>
      <div v-else-if="answer" class="mb-4">
        <h4 class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
          <Icon icon="lucide:message-circle" class="h-3.5 w-3.5" />
          你的回答
        </h4>
        <p
          class="rounded-xl bg-surface-input px-4 py-3 text-sm leading-relaxed text-text-secondary"
        >
          {{ answer }}
        </p>
      </div>
    </template>

    <!-- AI 反馈 -->
    <div v-if="score?.feedback" class="mb-4">
      <h4 class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
        <Icon icon="lucide:sparkles" class="h-3.5 w-3.5" />
        AI 点评
      </h4>
      <p class="text-sm leading-relaxed text-text-secondary">{{ score.feedback }}</p>
    </div>

    <!-- 参考答案 -->
    <div
      v-if="showReferenceAnswer && score?.improvedAnswer"
      class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
    >
      <h4 class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
        <Icon icon="lucide:book-open" class="h-3.5 w-3.5" />
        参考回答
      </h4>
      <p class="text-sm leading-relaxed text-text-secondary">{{ score.improvedAnswer }}</p>
    </div>
  </div>
</template>
