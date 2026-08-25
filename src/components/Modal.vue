<script setup lang="ts">
// @ts-nocheck
import { ref, watch } from 'vue'

/**
 * 通用弹窗组件
 * @param {boolean} show - 是否显示弹窗
 * @param {string} title - 弹窗标题
 * @param {string} confirmText - 确认按钮文字
 * @param {string} cancelText - 取消按钮文字
 * @param {'primary'|'danger'} confirmVariant - 确认按钮风格（primary=主题色, danger=红色）
 */
const props = defineProps({
  show: { type: Boolean, default: false },
  title: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  confirmVariant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'danger'].includes(value),
  },
})

/** 事件：close - 关闭弹窗, confirm - 确认操作 */
const emit = defineEmits(['close', 'confirm'])

/** 滚动条仅滚动时短暂显示 */
const isScrolling = ref(false)
let _scrollTimer: ReturnType<typeof setTimeout> | null = null
function onScroll() {
  isScrolling.value = true
  if (_scrollTimer) clearTimeout(_scrollTimer)
  _scrollTimer = setTimeout(() => {
    isScrolling.value = false
  }, 600)
}

/** 触发关闭弹窗事件 */
function handleClose() {
  emit('close')
}

/** 触发确认操作事件 */
function handleConfirm() {
  emit('confirm')
}

/**
 * 点击遮罩层关闭弹窗
 * 通过比较 e.target 和 e.currentTarget 确保只有点击遮罩本身（而非弹窗内容）时才关闭
 */
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
        <div
          class="mx-4 flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl sm:p-6"
        >
          <h3
            v-if="title"
            class="mb-4 shrink-0 text-base font-semibold tracking-tight text-text-primary"
          >
            {{ title }}
          </h3>
          <div
            class="thin-scrollbar min-h-0 flex-1 overflow-y-auto"
            :class="{ 'is-scrolling': isScrolling }"
            @scroll="onScroll"
          >
            <slot />
          </div>
          <div class="mt-5 flex shrink-0 justify-end gap-3">
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
                'bg-primary shadow-sm hover:brightness-110 hover:shadow-md':
                  confirmVariant === 'primary',
                'bg-red-500 shadow-sm shadow-red-500/20 hover:bg-red-500/90 hover:shadow-md hover:shadow-red-500/20':
                  confirmVariant === 'danger',
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
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-leave-active {
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-leave-active > :not(style) {
  transition:
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
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

/* 滚动条仅滚动时显示（配合 thin-scrollbar 的透明默认样式） */
.thin-scrollbar.is-scrolling::-webkit-scrollbar-thumb,
.thin-scrollbar.is-scrolling:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
}
.thin-scrollbar.is-scrolling {
  scrollbar-color: color-mix(in srgb, var(--color-text-muted) 45%, transparent) transparent;
}
</style>
