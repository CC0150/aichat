import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { modelOptions, getModelById } from '@/utils/modelConfig'

export const useAppStore = defineStore('app', () => {
  // 侧边栏是否折叠（桌面端）
  const sidebarCollapsed = ref(false)
  // 移动端抽屉是否打开
  const sidebarOpen = ref(false)
  // 是否为深色模式（默认 true）
  const isDark = ref(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('theme') !== 'light'
      : true
  )

  watch(
    isDark,
    (v) => {
      document.documentElement.classList.toggle('dark', v)
      try {
        localStorage.setItem('theme', v ? 'dark' : 'light')
      } catch (_) {}
    },
    { immediate: true }
  )

  const isSidebarCollapsed = computed(() => sidebarCollapsed.value)
  const isMobileDrawerOpen = computed(() => sidebarOpen.value)

  /** 切换桌面端侧边栏折叠状态 */
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /** 打开移动端侧边栏抽屉 */
  function openSidebar() {
    sidebarOpen.value = true
  }

  /** 关闭移动端侧边栏抽屉 */
  function closeSidebar() {
    sidebarOpen.value = false
  }

  /** 切换移动端侧边栏抽屉开关 */
  function toggleMobileDrawer() {
    sidebarOpen.value = !sidebarOpen.value
  }

  /**
   * 切换深浅色主题
   * - 更新 Vue state
   * - 立即更新 html.dark class
   * - 持久化到 localStorage
   */
  function toggleTheme() {
    isDark.value = !isDark.value
    // 直接更新 DOM 与持久化，确保点击必有反应
    document.documentElement.classList.toggle('dark', isDark.value)
    try {
      localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
    } catch (_) {}
  }

  // 当前选中的模型 id（与 ChatInput 模型切换、MessageArea 重新生成共用，避免切换模型后仍用错 key/模型）
  const currentModelId = ref(modelOptions[0]?.id ?? 'glm46v')
  const currentModel = computed(() => getModelById(currentModelId.value))

  /**
   * 设置当前对话使用的模型 id
   * - 影响 ChatInput 与 MessageArea 中的请求配置
   */
  function setCurrentModelId(id) {
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
}, {
  persist: true,
})
