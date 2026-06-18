<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
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
    <!-- Mobile overlay -->
    <Transition name="overlay">
      <button
        v-if="showOverlay"
        type="button"
        class="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        aria-label="Close sidebar"
        @click="appStore.closeSidebar"
      />
    </Transition>

    <!-- Mobile edge handle -->
    <button
      v-if="!appStore.sidebarOpen"
      type="button"
      class="mobile-edge-handle fixed left-0 top-1/2 z-30 -translate-y-1/2 flex items-center justify-end pr-0.5 rounded-r-full bg-surface/70 text-text-muted ring-1 ring-border/50 backdrop-blur-sm transition-all duration-200 hover:bg-surface hover:text-text-primary hover:pr-1 lg:hidden"
      aria-label="打开菜单"
      @click="appStore.openSidebar()"
    >
      <Icon icon="lucide:chevron-right" class="h-4 w-4" />
    </button>

    <!-- Sidebar: fixed on mobile, relative on desktop -->
    <aside
      class="sidebar-transition fixed left-0 top-0 z-50 flex h-full flex-col border-r border-border bg-surface lg:relative lg:z-auto"
      :class="[
        sidebarWidthClass,
        appStore.sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <AppSidebar />
    </aside>

    <!-- Main content -->
    <main class="flex min-h-0 min-w-0 flex-1 flex-col">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <Suspense>
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <component :is="Component" />
            </div>
            <template #fallback>
              <div class="flex h-full items-center justify-center">
                <div class="flex items-center gap-2 text-text-muted">
                  <span
                    class="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  />
                  <span class="text-sm">加载中...</span>
                </div>
              </div>
            </template>
          </Suspense>
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.overlay-enter-active {
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.overlay-leave-active {
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

.page-enter-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.page-leave-active {
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}

.mobile-edge-handle {
  width: 28px;
  height: 44px;
  padding-left: 4px;
}
</style>
