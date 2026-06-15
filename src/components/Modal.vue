<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  confirmVariant: {
    type: String,
    default: 'primary',
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
  if (e.target === e.currentTarget) handleClose()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
        @click="handleBackdropClick"
      >
        <div class="mx-4 w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl sm:p-6">
          <h3 v-if="title" class="mb-4 text-base font-semibold tracking-tight text-text-primary">{{ title }}</h3>
          <slot />
          <div class="mt-5 flex justify-end gap-3">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary transition-all duration-200 hover:bg-surface-input hover:text-text-primary"
              @click="handleClose"
            >
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-all duration-200"
              :class="{
                'bg-primary shadow-sm hover:brightness-110 hover:shadow-md': confirmVariant === 'primary',
                'bg-red-500 shadow-sm shadow-red-500/20 hover:bg-red-500/90 hover:shadow-md hover:shadow-red-500/20': confirmVariant === 'danger'
              }"
              @click="handleConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-active > :not(style) {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-leave-active {
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-leave-active > :not(style) {
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > :not(style) {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
.modal-leave-to > :not(style) {
  opacity: 0;
  transform: scale(0.98);
}
</style>
