<script setup>
defineProps({
  size: { type: Number, default: 32 },
  showText: { type: Boolean, default: false },
})
</script>

<template>
  <div class="inline-flex items-center gap-2.5 select-none">
    <!-- Logo mark: rounded badge with geometric spark -->
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class="shrink-0"
    >
      <!-- Outer rounded square badge -->
      <rect
        x="3"
        y="3"
        width="34"
        height="34"
        rx="8.5"
        class="fill-primary"
      />
      <!-- Four-point geometric spark -->
      <path
        d="M20 9L22 18L31 20L22 22L20 31L18 22L9 20L18 18Z"
        class="fill-primary-muted"
      />
    </svg>

    <span
      v-if="showText"
      class="truncate text-[16px] font-semibold tracking-tight text-text-primary"
    >AIChat</span>
  </div>
</template>
