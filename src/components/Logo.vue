<script setup lang="ts">
// @ts-nocheck
/**
 * Logo 组件 —— 「朱砂印章」形制
 * @param {number} size - Logo SVG 尺寸（宽高相等），默认 32px
 * @param {boolean} showText - 是否显示 "Intervy" 文字，默认不显示
 * @param {boolean} light - 是否用纸白文字（用于深色背景上的反白场景）
 */
defineProps({
  size: { type: Number, default: 32 },
  showText: { type: Boolean, default: false },
  light: { type: Boolean, default: false },
})
</script>

<template>
  <div class="inline-flex items-center gap-2.5 select-none">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
    >
      <!-- 印章底 -->
      <rect x="2" y="2" width="36" height="36" rx="10" class="fill-primary" />
      <rect x="2" y="2" width="36" height="36" rx="10" stroke="#000" stroke-opacity="0.14" />
      <!-- 面试官 · 提问者 -->
      <rect x="10" y="13" width="5" height="15" rx="2.5" fill="#f8f1e6" />
      <!-- 候选人 · 作答者 -->
      <rect x="25" y="13" width="5" height="15" rx="2.5" fill="#f8f1e6" opacity="0.6" />
      <!-- 提问 -->
      <path d="M15 19L24 16" stroke="#f8f1e6" stroke-width="2.4" stroke-linecap="round" />
      <!-- 作答 -->
      <path d="M15 25L24 28" stroke="#f8f1e6" stroke-width="2.4" stroke-linecap="round" />
      <!-- AI 星芒 -->
      <circle cx="26" cy="11" r="2.6" fill="#f8f1e6" opacity="0.85" />
    </svg>

    <span
      v-if="showText"
      class="truncate font-display text-[17px] font-light italic tracking-tight"
      :class="light ? 'text-[#f4ead9]' : 'text-text-primary'"
      >Intervy<span class="not-italic font-normal text-primary">·</span></span
    >
  </div>
</template>
