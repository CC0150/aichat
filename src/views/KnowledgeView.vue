<script setup>
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useKnowledgeStore } from '@/stores/knowledge'
import { parseFile } from '@/utils/docParser'
import Modal from '@/components/Modal.vue'

const store = useKnowledgeStore()

const viewMode = ref('list')       // 'list' | 'detail'
const detailKbId = ref(null)

// 创建 KB modal
const showCreateModal = ref(false)
const newName = ref('')
const newDescription = ref('')

// 删除确认
const showDeleteModal = ref(false)
const deleteTarget = ref(null)

// 文件上传
const fileInputRef = ref(null)
const isParsing = ref(false)
const uploadError = ref('')

onMounted(() => {
  store.fetchKBs()
})

// ===== KB 列表操作 =====

function openCreate() {
  newName.value = ''
  newDescription.value = ''
  showCreateModal.value = true
}

async function handleCreate() {
  if (!newName.value.trim()) return
  await store.createKB(newName.value.trim(), newDescription.value.trim())
  showCreateModal.value = false
}

function confirmDeleteKB(kb) {
  deleteTarget.value = kb
  showDeleteModal.value = true
}

async function handleDeleteKB() {
  if (!deleteTarget.value) return
  await store.deleteKB(deleteTarget.value.id)
  showDeleteModal.value = false
  deleteTarget.value = null
}

// ===== KB 详情操作 =====

function openDetail(kbId) {
  detailKbId.value = kbId
  store.fetchKB(kbId)
  viewMode.value = 'detail'
}

function backToList() {
  viewMode.value = 'list'
  detailKbId.value = null
  store.clearCurrent()
}

function triggerUpload() {
  if (fileInputRef.value) fileInputRef.value.click()
}

async function handleFileUpload(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  const file = files[0]
  isParsing.value = true
  uploadError.value = ''
  try {
    const parsed = await parseFile(file)
    if (!parsed.text || parsed.text.trim().length < 50) {
      uploadError.value = '文件内容过短（不足 50 字），请上传更丰富的文档。'
      return
    }
    await store.uploadFile(detailKbId.value, {
      name: parsed.name,
      type: parsed.type,
      content: parsed.text,
    })
    // 刷新详情
    await store.fetchKB(detailKbId.value)
  } catch (err) {
    uploadError.value = err.message || '文件上传失败'
  } finally {
    isParsing.value = false
    event.target.value = ''
  }
}

async function handleDeleteFile(fileId) {
  await store.deleteFile(detailKbId.value, fileId)
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatFileSize(charCount) {
  if (charCount < 1000) return `${charCount} 字`
  return `${(charCount / 1000).toFixed(1)}K 字`
}
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <div class="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 thin-scrollbar">
      <div class="mx-auto max-w-2xl">

        <!-- 列表视图 -->
        <template v-if="viewMode === 'list'">
          <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 class="text-lg sm:text-xl font-semibold text-text-primary">知识库</h1>
              <p class="mt-1 text-xs sm:text-sm text-text-muted">上传技术文档，AI 基于知识库内容生成面试题</p>
            </div>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 sm:w-auto"
              @click="openCreate"
            >
              <Icon icon="lucide:plus" class="h-4 w-4" />
              新建知识库
            </button>
          </div>

          <!-- 加载中 -->
          <div v-if="store.loading && store.kbs.length === 0" class="py-10 text-center sm:py-12">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p class="mt-3 text-sm text-text-muted">加载中...</p>
          </div>

          <!-- 空状态 -->
          <div v-else-if="store.kbs.length === 0" class="py-12 text-center sm:py-16">
            <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted">
              <Icon icon="lucide:database" class="h-8 w-8 text-primary" />
            </div>
            <h2 class="text-lg font-semibold text-text-primary">还没有知识库</h2>
            <p class="mt-2 text-sm text-text-muted">创建知识库并上传技术文档，即可基于文档内容生成面试题</p>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90"
              @click="openCreate"
            >
              <Icon icon="lucide:plus" class="h-4 w-4" />
              新建知识库
            </button>
          </div>

          <!-- KB 卡片列表 -->
          <div v-else class="space-y-2.5 sm:space-y-3">
            <button
              v-for="kb in store.kbs"
              :key="kb.id"
              type="button"
              class="w-full rounded-2xl border border-border bg-surface-elevated p-3.5 text-left transition-all duration-200 hover:border-primary/30 hover:bg-surface sm:p-4"
              @click="openDetail(kb.id)"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-muted sm:h-10 sm:w-10">
                    <Icon icon="lucide:folder" class="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-text-primary truncate">{{ kb.name }}</div>
                    <div v-if="kb.description" class="mt-0.5 text-xs text-text-muted truncate">{{ kb.description }}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-text-muted">
                      <span class="flex items-center gap-1"><Icon icon="lucide:file" class="h-3 w-3" />{{ kb.fileCount || 0 }} 个文件</span>
                      <span>{{ formatDate(kb.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    class="rounded-lg p-2 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 sm:p-1.5"
                    title="删除知识库"
                    @click.stop="confirmDeleteKB(kb)"
                  >
                    <Icon icon="lucide:trash-2" class="h-4 w-4" />
                  </button>
                  <Icon icon="lucide:chevron-right" class="h-4 w-4 text-text-muted" />
                </div>
              </div>
            </button>
          </div>
        </template>

        <!-- 详情视图 -->
        <template v-if="viewMode === 'detail' && store.currentKB">
          <div class="mb-6 flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-input hover:text-text-primary"
              @click="backToList"
            >
              <Icon icon="lucide:arrow-left" class="h-5 w-5" />
            </button>
            <div class="flex-1 min-w-0">
              <h1 class="text-base sm:text-lg font-semibold text-text-primary truncate">{{ store.currentKB.name }}</h1>
              <p v-if="store.currentKB.description" class="text-xs text-text-muted truncate">{{ store.currentKB.description }}</p>
            </div>
            <button
              type="button"
              class="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 sm:px-4"
              @click="triggerUpload"
            >
              <Icon icon="lucide:upload" class="h-4 w-4" />
              <span class="hidden sm:inline">上传文件</span>
            </button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".pdf,.docx,.txt,.md,.json,.csv"
              class="hidden"
              @change="handleFileUpload"
            />
          </div>

          <!-- 解析中 -->
          <div v-if="isParsing" class="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-4 py-8 text-center sm:px-6 sm:py-10">
            <div class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p class="text-sm text-text-muted">正在解析文件...</p>
          </div>

          <!-- 上传错误 -->
          <div v-if="uploadError" class="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
            {{ uploadError }}
          </div>

          <!-- 空文件状态 -->
          <div v-if="!store.currentKB.files?.length && !isParsing" class="py-10 text-center sm:py-12">
            <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted">
              <Icon icon="lucide:file-up" class="h-8 w-8 text-primary" />
            </div>
            <h2 class="text-lg font-semibold text-text-primary">还没有文件</h2>
            <p class="mt-2 text-sm text-text-muted">上传 PDF、Word 或文本文件，构建你的面试知识库</p>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90"
              @click="triggerUpload"
            >
              <Icon icon="lucide:upload" class="h-4 w-4" />
              上传文件
            </button>
          </div>

          <!-- 文件列表 -->
          <div v-if="store.currentKB.files?.length" class="space-y-2">
            <div
              v-for="file in store.currentKB.files"
              :key="file.id"
              class="flex items-center gap-2.5 rounded-xl border border-border bg-surface-elevated px-3 py-3 transition-colors hover:bg-surface sm:gap-3 sm:px-4"
            >
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                :class="file.type === 'pdf' ? 'bg-red-500/10 text-red-500' : file.type === 'word' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'"
              >
                <Icon
                  :icon="file.type === 'pdf' ? 'lucide:file-text' : file.type === 'word' ? 'lucide:file-text' : 'lucide:file'"
                  class="h-4 w-4"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-text-primary truncate">{{ file.name }}</div>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-text-muted">
                  <span>{{ file.type === 'pdf' ? 'PDF' : file.type === 'word' ? 'Word' : '文本' }}</span>
                  <span>{{ formatFileSize(file.charCount) }}</span>
                  <span>{{ formatDate(file.uploadedAt) }}</span>
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 sm:p-1.5"
                title="删除文件"
                @click="handleDeleteFile(file.id)"
              >
                <Icon icon="lucide:x" class="h-4 w-4" />
              </button>
            </div>
          </div>
        </template>

      </div>
    </div>

    <!-- 创建 Modal -->
    <Modal
      :show="showCreateModal"
      title="新建知识库"
      confirm-text="创建"
      cancel-text="取消"
      @close="showCreateModal = false"
      @confirm="handleCreate"
    >
      <div class="space-y-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-text-secondary">名称</label>
          <input
            v-model="newName"
            type="text"
            class="w-full rounded-lg border border-border bg-surface-input px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted"
            placeholder="例如：Java 面试准备"
            maxlength="50"
            @keydown.enter="handleCreate"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-secondary">描述（可选）</label>
          <input
            v-model="newDescription"
            type="text"
            class="w-full rounded-lg border border-border bg-surface-input px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-muted"
            placeholder="简单描述这个知识库的用途..."
            maxlength="100"
            @keydown.enter="handleCreate"
          />
        </div>
      </div>
    </Modal>

    <!-- 删除确认 Modal -->
    <Modal
      :show="showDeleteModal"
      title="删除知识库"
      confirm-text="删除"
      cancel-text="取消"
      confirm-variant="danger"
      @close="showDeleteModal = false; deleteTarget = null"
      @confirm="handleDeleteKB"
    >
      <p class="text-sm text-text-secondary">
        确定要删除知识库「{{ deleteTarget?.name }}」吗？所有文件将被永久删除，此操作不可撤销。
      </p>
    </Modal>
  </div>
</template>

<style scoped>
.thin-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.thin-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.thin-scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
  transition: background 0.3s;
}
.thin-scrollbar:hover::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
}
.thin-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}
.thin-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
</style>
