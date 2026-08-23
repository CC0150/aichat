<script setup lang="ts">
// @ts-nocheck
import { computed } from 'vue'
import { getScoreBgSolid, getScoreColor, getScoreLabel } from '@/utils/interviewHelpers'

const props = defineProps({
  score: { type: Number, required: true },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
  showLabel: { type: Boolean, default: false },
  showDenominator: { type: Boolean, default: false },
})

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px] rounded-md',
  md: 'h-9 w-9 text-xs font-bold rounded-xl',
  lg: 'h-12 w-12 text-base font-bold rounded-xl',
}

const badgeClass = computed(
  () => `${sizeClasses[props.size]} ${getScoreBgSolid(props.score)} text-white`,
)
const labelClass = computed(() => `text-xs font-medium ${getScoreColor(props.score)}`)
</script>

<template>
  <div class="inline-flex items-center gap-1.5">
    <span class="inline-flex items-center justify-center shrink-0" :class="badgeClass">
      {{ score }}
      <template v-if="showDenominator">
        <span class="ml-0.5 text-[0.55em] opacity-70">/10</span>
      </template>
    </span>
    <span v-if="showLabel" :class="labelClass">{{ getScoreLabel(score) }}</span>
  </div>
</template>
