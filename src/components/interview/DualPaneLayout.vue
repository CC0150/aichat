<script setup>
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

defineProps({
  leftWidth: { type: String, default: '35%' },
})

const mobileLeftOpen = ref(true)
</script>

<template>
  <!-- 桌面端 -->
  <div class="hidden lg:flex h-full">
    <div
      class="shrink-0 overflow-y-auto border-r border-border thin-scrollbar"
      :style="{ width: leftWidth }"
    >
      <slot name="left" />
    </div>
    <div class="flex-1 overflow-y-auto thin-scrollbar">
      <slot name="right" />
    </div>
  </div>

  <!-- 移动端 -->
  <div class="flex h-full flex-col lg:hidden">
    <!-- 导航条 -->
    <div class="shrink-0 border-b border-border bg-surface px-3 py-2">
      <slot name="mobileToggle">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-input"
          @click="mobileLeftOpen = !mobileLeftOpen"
        >
          <Icon :icon="mobileLeftOpen ? 'lucide:chevron-up' : 'lucide:list'" class="h-4 w-4" />列表
        </button>
      </slot>
    </div>

    <!-- 左栏 -->
    <div
      v-show="mobileLeftOpen"
      class="shrink-0 overflow-y-auto border-b border-border thin-scrollbar"
      :style="{ maxHeight: '55vh' }"
    >
      <slot name="left" />
    </div>

    <!-- 右栏 -->
    <div class="flex-1 overflow-y-auto thin-scrollbar">
      <slot name="right" />
    </div>
  </div>
</template>
