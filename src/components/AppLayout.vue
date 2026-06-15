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
    <main class="flex min-w-0 flex-1 flex-col">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
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
</style>
