import { createApp } from 'vue'
import VueVirtualScroller from 'vue3-virtual-scroller'
import 'vue3-virtual-scroller/dist/vue3-virtual-scroller.css'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import './assets/theme.css'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// Safari ITP 兼容：用 try-catch 包裹 localStorage 以避免隐私模式下抛异常
const safeLocalStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key)
    } catch (_) {
      return null
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch (_) {}
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key)
    } catch (_) {}
  },
}
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
} catch (_) {
  document.documentElement.classList.add('dark')
}

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
