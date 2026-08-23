import { createApp } from 'vue'
import VueVirtualScroller from 'vue3-virtual-scroller'
import 'vue3-virtual-scroller/dist/vue3-virtual-scroller.css'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import './assets/theme.css'

declare global {
  interface Window {
    __safeLocalStorage__: {
      getItem: (key: string) => string | null
      setItem: (key: string, value: string) => void
      removeItem: (key: string) => void
    }
  }
}

// Safari ITP 兼容：用 try-catch 包裹 localStorage 以避免隐私模式下抛异常
const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/**
 * 流式输出时 store 每个 chunk 都会变更，若每次都全量序列化并写入 localStorage，
 * 长对话会产生大量主线程阻塞。这里对写入做 trailing debounce（500ms），
 * 页面隐藏/关闭前强制 flush，保证挂起的更新不丢失。
 */
const pendingWrites = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushPendingWrites(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (pendingWrites.size === 0) return
  for (const [key, value] of pendingWrites) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  }
  pendingWrites.clear()
}

function scheduleWrite(key: string, value: string): void {
  pendingWrites.set(key, value)
  if (flushTimer) return
  flushTimer = setTimeout(flushPendingWrites, 500)
}

/** 供 pinia-plugin-persistedstate 使用的 debounce 存储适配器 */
const debouncedStorage: Storage = {
  get length() {
    return localStorage.length
  },
  clear() {
    localStorage.clear()
  },
  getItem: (key) => safeLocalStorage.getItem(key),
  setItem: (key, value) => scheduleWrite(key, value),
  removeItem: (key) => safeLocalStorage.removeItem(key),
  key: (index) => localStorage.key(index),
}

window.addEventListener('pagehide', flushPendingWrites)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPendingWrites()
})

// 将安全 storage 挂到 window 上，store 的 persist.storage 可引用
window.__safeLocalStorage__ = safeLocalStorage

// 首屏根据持久化的 app 状态设置 html class，避免主题闪烁
try {
  const raw = localStorage.getItem('app')
  if (raw) {
    const app = JSON.parse(raw)
    if (app.isDark === false) document.documentElement.classList.remove('dark')
    else document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.add('dark')
  }
} catch {
  document.documentElement.classList.add('dark')
}

const pinia = createPinia()
pinia.use(createPersistedState({ storage: debouncedStorage }))

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(FloatingVue, {
  themes: {
    tooltip: {
      delay: { show: 200, hide: 0 },
      distance: 8,
    },
  },
  distance: 8,
})
app.use(VueVirtualScroller)
app.mount('#app')
