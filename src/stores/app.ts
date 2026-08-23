import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { modelOptions, getModelById } from '@/utils/modelConfig'
import type { ModelOption } from '@/types'

export const useAppStore = defineStore(
  'app',
  () => {
    // 侧边栏是否折叠（桌面端）
    const sidebarCollapsed = ref(false)
    // 移动端抽屉是否打开
    const sidebarOpen = ref(false)
    // 是否为深色模式（默认 false = 日间模式）
    const isDark = ref(
      typeof localStorage !== 'undefined' ? localStorage.getItem('theme') === 'dark' : false,
    )

    watch(
      isDark,
      (v) => {
        document.documentElement.classList.toggle('dark', v)
        try {
          localStorage.setItem('theme', v ? 'dark' : 'light')
        } catch {
          /* ignore */
        }
      },
      { immediate: true },
    )

    const isSidebarCollapsed = computed(() => sidebarCollapsed.value)
    const isMobileDrawerOpen = computed(() => sidebarOpen.value)

    /** 切换桌面端侧边栏折叠状态 */
    function toggleSidebar(): void {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    /** 打开移动端侧边栏抽屉 */
    function openSidebar(): void {
      sidebarOpen.value = true
    }

    /** 关闭移动端侧边栏抽屉 */
    function closeSidebar(): void {
      sidebarOpen.value = false
    }

    /** 切换移动端侧边栏抽屉开关 */
    function toggleMobileDrawer(): void {
      sidebarOpen.value = !sidebarOpen.value
    }

    /**
     * 切换深浅色主题
     */
    function toggleTheme(): void {
      isDark.value = !isDark.value
      document.documentElement.classList.toggle('dark', isDark.value)
      try {
        localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
      } catch {
        /* ignore */
      }
    }

    // 当前选中的模型 id
    const currentModelId = ref<string>(modelOptions[0]?.id ?? 'deepseek-v4-flash')
    // 防止 localStorage 残留旧模型 id 导致 API 报错
    if (!modelOptions.some((m) => m.id === currentModelId.value)) {
      currentModelId.value = modelOptions[0]?.id ?? 'deepseek-v4-flash'
    }
    const currentModel = computed<ModelOption>(() => getModelById(currentModelId.value))

    /** 设置当前对话使用的模型 id */
    function setCurrentModelId(id: string): void {
      currentModelId.value = id
    }

    return {
      sidebarCollapsed,
      sidebarOpen,
      isDark,
      isSidebarCollapsed,
      isMobileDrawerOpen,
      toggleSidebar,
      openSidebar,
      closeSidebar,
      toggleMobileDrawer,
      toggleTheme,
      currentModelId,
      currentModel,
      setCurrentModelId,
      modelOptions,
    }
  },
  {
    persist: true,
  },
)
