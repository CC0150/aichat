<script setup>
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useKnowledgeStore } from '@/stores/knowledge'
import { parseFile } from '@/utils/docParser'
import { reindexKB } from '@/utils/knowledgeApi'
import { useToast } from '@/composables/useToast'
import Modal from '@/components/Modal.vue'

/** 知识库状态（列表、当前详情、文件等） */
const store = useKnowledgeStore()

/** toast 通知 */
const { toast, toastType, showToast } = useToast()

/** 当前视图模式：'list'（列表）或 'detail'（详情） */
const viewMode = ref('list')
/** 当前查看详情的知识库 ID */
const detailKbId = ref(null)

// 内联编辑
/** 是否处于编辑名称/描述模式 */
const isEditing = ref(false)
/** 编辑中的名称 */
const editName = ref('')
/** 编辑中的描述 */
const editDescription = ref('')

/** 进入编辑模式 */
function startEdit() {
  editName.value = store.currentKB?.name || ''
  editDescription.value = store.currentKB?.description || ''
  isEditing.value = true
}

/** 保存编辑 */
async function saveEdit() {
  if (!editName.value.trim()) return
  try {
    await store.updateKB(detailKbId.value, {
      name: editName.value.trim(),
      description: editDescription.value.trim(),
    })
    isEditing.value = false
  } catch (e) {
    // store 已处理错误
  }
}

// 创建 KB modal
/** 创建知识库弹窗是否可见 */
const showCreateModal = ref(false)
/** 新建知识库名称 */
const newName = ref('')
/** 新建知识库描述 */
const newDescription = ref('')

// 删除确认
/** 删除确认弹窗是否可见 */
const showDeleteModal = ref(false)
/** 待删除的知识库对象 */
const deleteTarget = ref(null)

// 文件上传
/** 文件选择 input DOM 引用 */
const fileInputRef = ref(null)
/** 是否正在解析上传的文件 */
const isParsing = ref(false)
/** 文件上传错误信息 */
const uploadError = ref('')

// 页面挂载时加载知识库列表
onMounted(() => {
  store.fetchKBs()
})

// ===== KB 列表操作 =====

/** 打开新建知识库弹窗（重置表单字段） */
function openCreate() {
  newName.value = ''
  newDescription.value = ''
  showCreateModal.value = true
}

/** 创建知识库：名称必填，描述可选 */
async function handleCreate() {
  if (!newName.value.trim()) return
  await store.createKB(newName.value.trim(), newDescription.value.trim())
  showCreateModal.value = false
}

/** 打开删除知识库确认弹窗 */
function confirmDeleteKB(kb) {
  deleteTarget.value = kb
  showDeleteModal.value = true
}

/** 正在索引中的 KB ID 集合（允许多个 KB 同时索引） */
const reindexingIds = ref(new Set())
/** 重新索引知识库 */
async function handleReindex(kb) {
  if (reindexingIds.value.has(kb.id)) return
  reindexingIds.value.add(kb.id)
  try {
    const result = await reindexKB(kb.id)
    const files = result.files ?? 0
    const chunks = result.chunks ?? 0
    showToast(`索引完成：${files} 个文件 → ${chunks} 个向量块`)
  } catch (e) {
    showToast('索引失败：' + (e.message || '未知错误'), 'error')
  } finally {
    reindexingIds.value.delete(kb.id)
  }
}

/** 关闭删除确认弹窗 */
function closeDeleteModal() {
  showDeleteModal.value = false
  deleteTarget.value = null
}

/** 执行删除知识库 */
async function handleDeleteKB() {
  if (!deleteTarget.value) return
  await store.deleteKB(deleteTarget.value.id)
  showDeleteModal.value = false
  deleteTarget.value = null
}

// ===== KB 详情操作 =====

/** 进入知识库详情视图（加载文件列表） */
function openDetail(kbId) {
  detailKbId.value = kbId
  store.fetchKB(kbId)
  viewMode.value = 'detail'
}

/** 返回知识库列表视图 */
function backToList() {
  viewMode.value = 'list'
  detailKbId.value = null
  isEditing.value = false
  store.clearCurrent()
}

/** 触发文件选择对话框 */
function triggerUpload() {
  if (fileInputRef.value) fileInputRef.value.click()
}

/**
 * 处理文件上传到知识库
 * 1. 客户端解析文件内容（PDF/Word/TXT）
 * 2. 内容需 >= 50 字才接受
 * 3. 上传到服务器后刷新详情列表
 */
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
    // 刷新详情以展示新上传的文件
    await store.fetchKB(detailKbId.value)
  } catch (err) {
    uploadError.value = err.message || '文件上传失败'
  } finally {
    isParsing.value = false
    event.target.value = ''
  }
}

/** 删除知识库中的指定文件 */
async function handleDeleteFile(fileId) {
  await store.deleteFile(detailKbId.value, fileId)
}

/** 格式化 ISO 日期为中文短格式（如 "2026年7月12日"） */
function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** 格式化文件大小：<1000 字直接显示，>=1000 显示 "x.xK 字" */
function formatFileSize(charCount) {
  if (charCount < 1000) return `${charCount} 字`
  return `${(charCount / 1000).toFixed(1)}K 字`
}
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <!-- Toast -->
    <Transition name="fade">
      <div
        v-if="toast"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
        :class="toastType === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'"
      >
        <Icon
          :icon="toastType === 'error' ? 'lucide:alert-circle' : 'lucide:check-circle'"
          class="h-4 w-4"
        />
        {{ toast }}
      </div>
    </Transition>

    <div class="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 thin-scrollbar">
      <div class="mx-auto max-w-2xl">
        <!-- 列表视图 -->
        <template v-if="viewMode === 'list'">
          <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 class="text-lg sm:text-xl font-semibold text-text-primary">知识库</h1>
              <p class="mt-1 text-xs sm:text-sm text-text-muted">
                上传技术文档，AI 基于知识库内容生成面试题
              </p>
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
            <div
              class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            <p class="mt-3 text-sm text-text-muted">加载中...</p>
          </div>

          <!-- 空状态 -->
          <div v-else-if="store.kbs.length === 0" class="py-12 text-center sm:py-16">
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted"
            >
              <Icon icon="lucide:database" class="h-8 w-8 text-primary" />
            </div>
            <h2 class="text-lg font-semibold text-text-primary">还没有知识库</h2>
            <p class="mt-2 text-sm text-text-muted">
              创建知识库并上传技术文档，即可基于文档内容生成面试题
            </p>
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
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-muted sm:h-10 sm:w-10"
                  >
                    <Icon icon="lucide:folder" class="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-text-primary truncate">
                      {{ kb.name }}
                    </div>
                    <div v-if="kb.description" class="mt-0.5 text-xs text-text-muted truncate">
                      {{ kb.description }}
                    </div>
                    <div
                      class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-text-muted"
                    >
                      <span class="flex items-center gap-1"
                        ><Icon icon="lucide:file" class="h-3 w-3" />{{
                          kb.fileCount || 0
                        }}
                        个文件</span
                      >
                      <span>{{ formatDate(kb.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <button
                    type="button"
                    class="rounded-lg p-2 text-text-muted transition-colors hover:bg-primary/10 hover:text-primary sm:p-1.5"
                    title="重新索引（重新切块+向量化）"
                    :disabled="reindexingIds.has(kb.id)"
                    @click.stop="handleReindex(kb)"
                  >
                    <Icon
                      :icon="reindexingIds.has(kb.id) ? 'lucide:loader-2' : 'lucide:refresh-cw'"
                      :class="['h-4 w-4', reindexingIds.has(kb.id) ? 'animate-spin' : '']"
                    />
                  </button>
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
              <template v-if="isEditing">
                <input
                  v-model="editName"
                  type="text"
                  class="w-full rounded-lg border border-border bg-surface-input px-2.5 py-1.5 text-sm font-semibold text-text-primary focus:border-primary focus:outline-none"
                  maxlength="100"
                  @keydown.enter="saveEdit"
                  @keydown.escape="isEditing = false"
                />
                <input
                  v-model="editDescription"
                  type="text"
                  class="mt-1.5 w-full rounded-lg border border-border bg-surface-input px-2.5 py-1.5 text-xs text-text-secondary focus:border-primary focus:outline-none"
                  maxlength="500"
                  placeholder="描述（可选）"
                  @keydown.enter="saveEdit"
                  @keydown.escape="isEditing = false"
                />
              </template>
              <template v-else>
                <h1 class="text-base sm:text-lg font-semibold text-text-primary truncate">
                  {{ store.currentKB.name }}
                </h1>
                <p v-if="store.currentKB.description" class="text-xs text-text-muted truncate">
                  {{ store.currentKB.description }}
                </p>
              </template>
            </div>
            <template v-if="isEditing">
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/10"
                title="保存"
                @click="saveEdit"
              >
                <Icon icon="lucide:check" class="h-4 w-4" />
              </button>
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-input"
                title="取消"
                @click="isEditing = false"
              >
                <Icon icon="lucide:x" class="h-4 w-4" />
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-input hover:text-text-primary"
                title="编辑名称"
                @click="startEdit"
              >
                <Icon icon="lucide:pencil" class="h-4 w-4" />
              </button>
            </template>
            <button
              v-if="!isEditing"
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
          <div
            v-if="isParsing"
            class="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-4 py-8 text-center sm:px-6 sm:py-10"
          >
            <div
              class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            <p class="text-sm text-text-muted">正在解析文件...</p>
          </div>

          <!-- 上传错误 -->
          <div
            v-if="uploadError"
            class="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500"
          >
            {{ uploadError }}
          </div>

          <!-- Store 错误 -->
          <div
            v-if="store.error"
            class="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500"
          >
            {{ store.error }}
          </div>

          <!-- 空文件状态 -->
          <div
            v-if="!store.currentKB.files?.length && !isParsing"
            class="py-10 text-center sm:py-12"
          >
            <div
              class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted"
            >
              <Icon icon="lucide:file-up" class="h-8 w-8 text-primary" />
            </div>
            <h2 class="text-lg font-semibold text-text-primary">还没有文件</h2>
            <p class="mt-2 text-sm text-text-muted">
              上传 PDF、Word 或文本文件，构建你的面试知识库
            </p>
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
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                :class="
                  file.type === 'pdf'
                    ? 'bg-red-500/10 text-red-500'
                    : file.type === 'word'
                      ? 'bg-blue-500/10 text-blue-500'
                      : 'bg-emerald-500/10 text-emerald-500'
                "
              >
                <Icon
                  :icon="
                    file.type === 'pdf'
                      ? 'lucide:file-text'
                      : file.type === 'word'
                        ? 'lucide:file-text'
                        : 'lucide:file'
                  "
                  class="h-4 w-4"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm text-text-primary truncate">{{ file.name }}</div>
                <div
                  class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0 text-xs text-text-muted"
                >
                  <span>{{
                    file.type === 'pdf' ? 'PDF' : file.type === 'word' ? 'Word' : '文本'
                  }}</span>
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
      @close="closeDeleteModal"
      @confirm="handleDeleteKB"
    >
      <p class="text-sm text-text-secondary">
        确定要删除知识库「{{ deleteTarget?.name }}」吗？所有文件将被永久删除，此操作不可撤销。
      </p>
    </Modal>
  </div>
</template>

<style scoped></style>
