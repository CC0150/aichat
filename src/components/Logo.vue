<script setup>
defineProps({
  size: { type: Number, default: 32 },
  showText: { type: Boolean, default: false },
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
      class="shrink-0"
    >
      <!-- Rounded square background -->
      <rect x="3" y="3" width="34" height="34" rx="9" class="fill-primary" />
      <!-- Interviewer pillar -->
      <rect x="9" y="12" width="5" height="16" rx="2.5" fill="white" />
      <!-- Candidate pillar -->
      <rect x="26" y="12" width="5" height="16" rx="2.5" fill="white" opacity="0.55" />
      <!-- Dialogue: interviewer asks -->
      <path d="M14 18L24 15" stroke="white" stroke-width="2.5" stroke-linecap="round" />
      <!-- Dialogue: candidate replies -->
      <path d="M14 24L24 27" stroke="white" stroke-width="2.5" stroke-linecap="round" />
      <!-- AI spark -->
      <circle cx="27" cy="10" r="3" class="fill-primary-muted" />
    </svg>

    <span
      v-if="showText"
      class="truncate text-[16px] font-semibold tracking-tight text-text-primary"
      >Intervy</span
    >
  </div>
</template>
