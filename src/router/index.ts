import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  // 登录页：独立路由，不套 AppLayout（无侧边栏/顶栏）
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true },
  },
  // 主应用：整体套 AppLayout（侧边栏 + 内容区）
  {
    path: '/',
    component: () => import('@/components/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'Chat',
        component: () => import('@/views/ChatView.vue'),
        meta: { title: '对话' },
      },
      {
        path: 'chat/:id?',
        name: 'ChatById',
        component: () => import('@/views/ChatView.vue'),
        meta: { title: '对话' },
      },
      {
        path: 'interview',
        name: 'Interview',
        component: () => import('@/views/InterviewView.vue'),
        meta: { title: 'AI 面试' },
      },
      {
        path: 'stats',
        name: 'Stats',
        component: () => import('@/views/StatsView.vue'),
        meta: { title: '面试记录' },
      },
      {
        path: 'knowledge',
        name: 'Knowledge',
        component: () => import('@/views/KnowledgeView.vue'),
        meta: { title: '知识库' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - Intervy` : 'Intervy'
})

// 登录守卫：除 meta.public 路由外，未登录统一重定向到 /login
router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const auth = useAuthStore()
  if (auth.status === 'unknown') await auth.init()
  if (!auth.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
