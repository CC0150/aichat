<script setup>
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppSidebar from './AppSidebar.vue'

const appStore = useAppStore()

const sidebarWidthClass = computed(() => ({
  'w-sidebar': !appStore.sidebarCollapsed,
  'w-sidebar-collapsed': appStore.sidebarCollapsed,
}))

const showOverlay = computed(() => appStore.sidebarOpen)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background text-text-primary">
    <!-- 移动端遮罩 -->
    <Transition name="fade">
      <button
        v-if="showOverlay"
        type="button"
        class="fixed inset-0 z-40 bg-black/50 lg:hidden"
        aria-label="关闭侧边栏"
        @click="appStore.closeSidebar"
      />
    </Transition>

    <!-- 侧边栏：桌面端固定宽度，移动端抽屉 -->
    <aside
      class="fixed left-0 top-0 z-50 flex h-full flex-col border-r border-border bg-surface transition-all duration-300 lg:relative lg:z-auto"
      :class="[
        sidebarWidthClass,
        appStore.sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <AppSidebar />
    </aside>

    <!-- 主内容区 -->
    <main class="flex min-w-0 flex-1 flex-col">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
