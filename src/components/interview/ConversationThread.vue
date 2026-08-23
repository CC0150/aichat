<script setup lang="ts">
// @ts-nocheck
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

const props = defineProps({
  conversations: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
})

/** 获取消息角色标签 */
function getRoleLabel(msg) {
  if (msg.role === 'user') return { icon: 'lucide:user', text: '你' }
  return { icon: 'lucide:bot', text: 'AI 追问' }
}

const paddingClass = computed(() => (props.compact ? 'px-3 py-2' : 'px-4 py-2.5'))
const textSizeClass = computed(() => (props.compact ? 'text-xs' : 'text-sm'))
</script>

<template>
  <div class="space-y-2.5">
    <div
      v-for="(msg, mi) in conversations"
      :key="mi"
      class="flex"
      :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
    >
      <div
        class="max-w-[85%] rounded-2xl border"
        :class="[
          paddingClass,
          msg.role === 'user'
            ? 'bg-primary/10 text-text-primary border-primary/15'
            : 'bg-surface-input text-text-secondary border-border',
        ]"
      >
        <div
          class="mb-1 flex items-center gap-1.5 text-xs font-medium"
          :class="msg.role === 'user' ? 'text-primary' : 'text-text-muted'"
        >
          <Icon :icon="getRoleLabel(msg).icon" class="h-3 w-3" />
          <span>{{ getRoleLabel(msg).text }}</span>
        </div>
        <p :class="textSizeClass">{{ msg.content }}</p>
      </div>
    </div>
  </div>
</template>
