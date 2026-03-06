<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  confirmVariant: {
    type: String,
    default: 'primary', // primary, danger
    validator: (value) => ['primary', 'danger'].includes(value)
  }
})

const emit = defineEmits(['close', 'confirm'])

function handleClose() {
  emit('close')
}

function handleConfirm() {
  emit('confirm')
}

function handleBackdropClick(e) {
  if (e.target === e.currentTarget) {
    handleClose()
  }
}
</script>

<template>
  <!-- 使用 Teleport 始终挂载到 body，保证模态框居中在整个屏幕，而不是某个局部容器（例如侧边栏） -->
  <Teleport to="body">
    <div 
      v-if="show" 
      class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20 backdrop-blur-sm"
      @click="handleBackdropClick"
    >
      <div class="mx-auto w-full max-w-md rounded-2xl bg-surface-elevated p-6 shadow-xl">
        <h3 v-if="title" class="mb-4 text-lg font-medium text-text-primary">{{ title }}</h3>
        <slot></slot>
        <div class="mt-4 flex justify-end gap-3">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors duration-150"
            @click="handleClose"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-white transition-colors duration-150"
            :class="{
              'bg-primary hover:bg-primary/90': confirmVariant === 'primary',
              'bg-red-500 hover:bg-red-500/90': confirmVariant === 'danger'
            }"
            @click="handleConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>