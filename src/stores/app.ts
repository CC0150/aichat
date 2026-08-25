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

    // ===== 自定义 AI 供应商（BYOK）=====
    /** 一个供应商一条记录：自定义名称 + baseUrl + apiKey + 单个 model（可多供应商） */
    interface CustomProvider {
      name: string
      baseUrl: string
      apiKey: string
      model: string
      supportsVision?: boolean
    }
    const customProviders = ref<CustomProvider[]>([])
    /** 当前选用的供应商下标 */
    const activeProviderIndex = ref(0)

    // 兼容旧版持久化的单供应商/旧模型字段 → 迁移成供应商数组
    try {
      const prevRaw = localStorage.getItem('app')
      if (prevRaw) {
        const prev = JSON.parse(prevRaw)
        if (Array.isArray(prev.customProviders)) {
          customProviders.value = prev.customProviders
        } else if (
          prev.customBaseUrl ||
          prev.customModel ||
          (Array.isArray(prev.customModels) && prev.customModels.length)
        ) {
          const m = Array.isArray(prev.customModels) ? prev.customModels[0] : undefined
          customProviders.value = [
            {
              name: prev.customName || '',
              baseUrl: prev.customBaseUrl || '',
              apiKey: prev.customApiKey || '',
              model: m?.name || prev.customModel || '',
              supportsVision: m?.supportsVision ?? prev.customSupportsVision ?? false,
            },
          ]
        }
      }
    } catch {
      /* ignore */
    }

    // 自愈：持久化状态可能因 schema 迭代残留坏下标/空数组，越界时归位
    if (customProviders.value.length === 0) {
      activeProviderIndex.value = 0
    } else if (activeProviderIndex.value >= customProviders.value.length) {
      activeProviderIndex.value = customProviders.value.length - 1
    }

    /** 当前生效的供应商配置 */
    const activeProvider = computed(() => customProviders.value[activeProviderIndex.value])

    /** 用户是否显式切回平台默认模型（保留供应商配置，只是不再使用） */
    const usePlatform = ref(false)

    /** 是否启用自定义供应商（未显式切平台、且当前供应商 baseUrl/apiKey 都填了才生效） */
    const useCustomApi = computed(() => {
      if (usePlatform.value) return false
      const p = activeProvider.value
      return !!p && !!(p.baseUrl && p.apiKey)
    })

    /** 实际请求使用的模型名 */
    const effectiveModelId = computed<string>(() => {
      if (!useCustomApi.value) return currentModelId.value
      return (activeProvider.value?.model || '').trim() || (modelOptions[0]?.model ?? '')
    })

    /** 自定义模式下用于 token 预算的上下文窗口（未知则用平台默认） */
    const activeContextWindow = computed(() =>
      useCustomApi.value
        ? (modelOptions[0]?.contextWindow ?? 128000)
        : (currentModel.value?.contextWindow ?? 128000),
    )

    /** 自定义模式下是否把图片作为上下文发送 */
    const activeSupportsVision = computed(() =>
      useCustomApi.value
        ? (activeProvider.value?.supportsVision ?? false)
        : (currentModel.value?.supportsVision ?? false),
    )

    /** 构造 AI 请求体：自定义时附带 baseUrl/apiKey + model，平台模式与现状完全一致 */
    function aiRequestParams<T extends object>(
      extra: T,
    ): T & { baseUrl?: string; apiKey?: string; model: string } {
      const p = activeProvider.value
      return {
        ...(useCustomApi.value && p ? { baseUrl: p.baseUrl, apiKey: p.apiKey } : {}),
        model: effectiveModelId.value,
        ...extra,
      }
    }

    /** 切换当前选用的供应商 */
    function setActiveProvider(i: number): void {
      if (i >= 0 && i < customProviders.value.length) activeProviderIndex.value = i
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
      customProviders,
      activeProviderIndex,
      activeProvider,
      setActiveProvider,
      usePlatform,
      useCustomApi,
      effectiveModelId,
      activeContextWindow,
      activeSupportsVision,
      aiRequestParams,
    }
  },
  {
    persist: true,
  },
)
