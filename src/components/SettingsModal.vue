<script setup lang="ts">
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Modal from './Modal.vue'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [v: boolean] }>()

const appStore = useAppStore()

interface ProviderDraft {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  supportsVision: boolean
  showKey: boolean
  /** 卡片是否展开（仅草稿态，不持久化） */
  expanded: boolean
}

function emptyProvider(): ProviderDraft {
  return {
    name: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    supportsVision: false,
    showKey: false,
    expanded: true,
  }
}

// 草稿状态：打开弹窗时从 store 载入，保存时才写回，取消不落盘
const providers = ref<ProviderDraft[]>([])

const PRESETS = [
  { name: '自定义', baseUrl: '', model: '' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  {
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
  },
]

function loadDrafts() {
  const list = appStore.customProviders
  providers.value = list.map((p, i) => ({
    name: p.name || '',
    baseUrl: p.baseUrl,
    apiKey: p.apiKey,
    model: p.model,
    supportsVision: !!p.supportsVision,
    showKey: false,
    // 默认全部展开，避免配好的供应商字段被收起来看不到；折叠是用户的显式操作
    expanded: true,
  }))
}

watch(
  () => props.show,
  (v) => {
    if (v) loadDrafts()
  },
)

function close() {
  emit('update:show', false)
}

function applyPreset(name: string) {
  const p = PRESETS.find((x) => x.name === name)
  if (!p) return
  providers.value.push(
    p.baseUrl
      ? {
          name: p.name,
          baseUrl: p.baseUrl,
          apiKey: '',
          model: p.model,
          supportsVision: false,
          showKey: false,
          expanded: true,
        }
      : emptyProvider(),
  )
}

function addProvider() {
  providers.value.push(emptyProvider())
}

function removeProvider(i: number) {
  providers.value.splice(i, 1)
}

function save() {
  const cleaned = providers.value
    .map(({ name, baseUrl, apiKey, model, supportsVision }) => ({
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      supportsVision,
    }))
    .filter((p) => p.baseUrl && p.apiKey)
  appStore.customProviders = cleaned
  if (appStore.activeProviderIndex >= cleaned.length) appStore.activeProviderIndex = 0
  close()
}

/** 切换到平台默认模型：非破坏性，保留已填写的供应商配置，随时可在输入框切回 */
function switchToPlatform() {
  appStore.usePlatform = true
  close()
}
</script>

<template>
  <Modal
    :show="show"
    title="模型设置"
    confirm-text="保存"
    cancel-text="取消"
    @close="close"
    @confirm="save"
  >
    <div class="space-y-4">
      <!-- 供应商预设 -->
      <div>
        <p class="mb-1.5 text-[13px] font-medium text-text-secondary">常用供应商（点击快速新建）</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="p in PRESETS"
            :key="p.name"
            type="button"
            class="rounded-lg bg-surface-input px-2.5 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            @click="applyPreset(p.name)"
          >
            {{ p.name }}
          </button>
        </div>
        <p class="mt-1.5 text-[11px] leading-relaxed text-text-muted">
          可配置多个供应商，每个供应商绑定一个模型；保存后可在聊天输入区切换使用。供应商需兼容
          OpenAI 协议，未配置时使用平台默认模型。
        </p>
      </div>

      <!-- 已保存的供应商列表（记录点：可随时改任意一条的模型/密钥；点击标题栏展开/收起） -->
      <div class="space-y-2">
        <div
          v-for="(p, i) in providers"
          :key="i"
          class="overflow-hidden rounded-xl border border-border bg-surface/40"
        >
          <!-- 标题栏：点击展开/收起（名称 + 折叠箭头 + 删除） -->
          <div
            class="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-input"
            @click="p.expanded = !p.expanded"
          >
            <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-text-secondary">
              {{ p.name || `供应商 ${i + 1}` }}
            </span>
            <Icon
              :icon="p.expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
              class="h-4 w-4 shrink-0 text-text-muted"
            />
            <button
              v-tooltip="'移除该供应商'"
              type="button"
              class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-red-500"
              :aria-label="'移除供应商'"
              @click.stop="removeProvider(i)"
            >
              <Icon icon="lucide:trash-2" class="h-4 w-4" />
            </button>
          </div>

          <!-- 展开后的字段 -->
          <div v-if="p.expanded" class="space-y-2 border-t border-border p-3">
            <input
              v-model="p.name"
              type="text"
              placeholder="供应商名称（可选，如：我的 OpenAI）"
              class="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary"
            />
            <input
              v-model="p.baseUrl"
              type="text"
              placeholder="https://api.openai.com/v1"
              class="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary"
            />

            <div class="relative">
              <input
                v-model="p.apiKey"
                :type="p.showKey ? 'text' : 'password'"
                placeholder="sk-..."
                autocomplete="off"
                class="w-full rounded-lg border border-border bg-surface-input px-3 py-2 pr-9 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary"
                :aria-label="p.showKey ? '隐藏密钥' : '显示密钥'"
                @click="p.showKey = !p.showKey"
              >
                <Icon :icon="p.showKey ? 'lucide:eye-off' : 'lucide:eye'" class="h-4 w-4" />
              </button>
            </div>

            <div class="flex items-center gap-2">
              <input
                v-model="p.model"
                type="text"
                placeholder="模型名，如 gpt-4o-mini"
                class="min-w-0 flex-1 rounded-lg border border-border bg-surface-input px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary"
              />
              <button
                v-tooltip="'该模型支持图片输入（视觉）'"
                type="button"
                class="shrink-0 rounded-lg border border-border bg-surface-input px-2 py-2 text-text-muted transition-colors"
                :class="{ 'text-primary': p.supportsVision }"
                :aria-label="'视觉'"
                @click="p.supportsVision = !p.supportsVision"
              >
                <Icon :icon="p.supportsVision ? 'lucide:eye' : 'lucide:eye-off'" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2 text-[13px] font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
        @click="addProvider"
      >
        <Icon icon="lucide:plus" class="h-4 w-4" />
        添加供应商
      </button>

      <div class="flex items-center justify-end pt-1">
        <button
          type="button"
          class="text-[12px] font-medium text-text-muted transition-colors hover:text-text-primary"
          @click="switchToPlatform"
        >
          使用平台默认模型
        </button>
      </div>
    </div>
  </Modal>
</template>
