<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'
import Logo from '@/components/Logo.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')

const title = computed(() => (mode.value === 'login' ? '登录' : '注册'))
const submitText = computed(() =>
  auth.loading ? '请稍候...' : mode.value === 'login' ? '进入 Intervy' : '注册并进入',
)

function switchMode(m: 'login' | 'register'): void {
  mode.value = m
  auth.error = ''
}

async function submit(): Promise<void> {
  const name = username.value.trim()
  if (!name || !password.value) {
    auth.error = '请输入用户名和密码'
    return
  }
  if (mode.value === 'register' && password.value !== confirmPassword.value) {
    auth.error = '两次输入的密码不一致'
    return
  }

  const ok =
    mode.value === 'login'
      ? await auth.login(name, password.value)
      : await auth.register(name, password.value)
  if (ok) {
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/')
  }
}
</script>

<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12"
  >
    <!-- 气氛：冰青微光 -->
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div
        class="absolute left-1/2 top-[-20%] h-[420px] w-[520px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl glow-breathe"
      />
      <div
        class="absolute bottom-[-15%] left-[8%] h-[320px] w-[320px] rounded-full bg-[#5aa9d9]/[0.07] blur-3xl glow-breathe"
        style="animation-delay: -4.5s"
      />
    </div>

    <div class="relative w-full max-w-md park-in">
      <!-- 头部：印章 + 书坊标题 -->
      <div class="mb-9 flex flex-col items-center text-center">
        <Logo :size="66" />
        <h1 class="mt-6 font-display text-3xl font-light tracking-[0.12em] text-text-primary">
          Intervy
        </h1>
        <p class="mt-2 font-display text-sm italic tracking-[0.14em] text-text-muted">
          前端进阶 · AI 面试陪练
        </p>
      </div>

      <!-- 细线分隔 -->
      <div class="mb-8 flex items-center gap-3" aria-hidden="true">
        <span class="h-px flex-1 bg-border" />
        <span
          class="rounded-full border border-border px-3 py-0.5 text-[10px] tracking-[0.3em] text-text-muted"
        >
          {{ mode === 'login' ? '进 入' : '建 立' }}
        </span>
        <span class="h-px flex-1 bg-border" />
      </div>

      <!-- 表单面板 -->
      <div class="rounded-2xl bg-surface/70 p-6 backdrop-blur-md sm:p-8">
        <form class="space-y-4" @submit.prevent="submit">
          <div>
            <label class="mb-1.5 block text-xs text-text-secondary">用户名</label>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              maxlength="24"
              class="w-full rounded-lg border border-border bg-surface-input/70 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors"
              placeholder="3-24 位字母、数字、下划线或中文"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs text-text-secondary">密码</label>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              maxlength="100"
              class="w-full rounded-lg border border-border bg-surface-input/70 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors"
              placeholder="至少 6 位"
            />
          </div>
          <div v-if="mode === 'register'">
            <label class="mb-1.5 block text-xs text-text-secondary">确认密码</label>
            <input
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              maxlength="100"
              class="w-full rounded-lg border border-border bg-surface-input/70 px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted transition-colors"
              placeholder="再次输入密码"
            />
          </div>

          <p v-if="auth.error" class="text-sm text-red-500">{{ auth.error }}</p>

          <button
            type="submit"
            :disabled="auth.loading"
            class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-display text-sm tracking-[0.2em] text-white transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon v-if="auth.loading" icon="lucide:loader-2" class="h-4 w-4 animate-spin" />
            {{ submitText }}
          </button>
        </form>

        <p v-if="mode === 'login'" class="mt-6 text-center text-xs text-text-muted">
          初次到访？
          <button
            type="button"
            class="font-medium text-primary transition-colors hover:text-text-primary"
            @click="switchMode('register')"
          >
            创建一个账号
          </button>
        </p>
        <p v-else class="mt-6 text-center text-xs text-text-muted">
          已有账号？
          <button
            type="button"
            class="font-medium text-primary transition-colors hover:text-text-primary"
            @click="switchMode('login')"
          >
            直接登录
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
