import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiRequest } from '@/utils/apiClient'

export interface AuthUser {
  id: number
  username: string
  createdAt?: string
}

/**
 * 登录状态 store。
 * 会话凭证在 httpOnly cookie 里（前端拿不到），因此本 store 不持久化到
 * localStorage，启动时通过 GET /api/auth/me 从服务端恢复。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const status = ref<'unknown' | 'authenticated' | 'guest'>('unknown')
  const loading = ref(false)
  const error = ref('')

  const isAuthenticated = computed(() => status.value === 'authenticated')

  let initPromise: Promise<void> | null = null

  /** 启动/首次导航时调用一次，用 me 接口恢复会话 */
  async function init(): Promise<void> {
    if (status.value !== 'unknown') return
    if (initPromise) return initPromise
    initPromise = (async () => {
      try {
        const data = await apiRequest('/api/auth/me')
        user.value = data.user
        status.value = 'authenticated'
      } catch {
        user.value = null
        status.value = 'guest'
      } finally {
        initPromise = null
      }
    })()
    return initPromise
  }

  function handleSuccess(data: { user: AuthUser }): void {
    user.value = data.user
    status.value = 'authenticated'
    error.value = ''
  }

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      handleSuccess(data)
      return true
    } catch (e: any) {
      error.value = e.message || '登录失败'
      status.value = 'guest'
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: { username, password },
      })
      handleSuccess(data)
      return true
    } catch (e: any) {
      error.value = e.message || '注册失败'
      status.value = 'guest'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch {
      /* 服务端会话删除失败不阻塞本地登出 */
    }
    user.value = null
    status.value = 'guest'
  }

  return {
    user,
    status,
    loading,
    error,
    isAuthenticated,
    init,
    login,
    register,
    logout,
  }
})
