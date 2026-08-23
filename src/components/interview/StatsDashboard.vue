<script setup lang="ts">
// @ts-nocheck
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useInterviewStore } from '@/stores/interview'
import { Icon } from '@iconify/vue'
import {
  getScoreColor,
  getScoreBgSolid,
  getScoreLabel,
  getCategoryStats,
  getRecordWeakPoints,
  getHistoryCategoryStats,
  getHistoryWeakPoints,
} from '@/utils/interviewHelpers'
import Modal from '@/components/Modal.vue'
import DualPaneLayout from './DualPaneLayout.vue'
import QuestionReviewCard from './QuestionReviewCard.vue'
import ScoreBadge from './ScoreBadge.vue'
import { exportRecords } from '@/utils/interviewExport'

Chart.register(...registerables)

/** 面试状态（历史记录、统计数据等） */
const interviewStore = useInterviewStore()

/** 导出菜单是否可见 */
const showExportMenu = ref(false)

/** 执行导出：调用 exportRecords 工具函数触发浏览器下载 */
function handleExport(format) {
  const records = interviewStore.history
  if (records.length === 0) return
  exportRecords(records, format)
  showExportMenu.value = false
}

/** 柱状图 canvas DOM 引用 */
const barCanvas = ref<any>(null)
/** Chart.js 柱状图实例 */
let barChart = null

// 详情弹窗 — replaced with inline dual-pane
/** 左侧列表中当前选中的记录 ID */
const selectedRecordId = ref<any>(null)

/** 当前选中记录 */
const selectedRecord = computed(
  () => interviewStore.history.find((r) => r.id === selectedRecordId.value) || null,
)

// 删除模式
/** 是否处于批量删除模式 */
const isDeleteMode = ref(false)
/** 批量删除模式中已勾选的记录 ID 集合 */
const checkedIds = ref(new Set())
/** 删除确认弹窗是否可见 */
const showDeleteConfirm = ref(false)

/** 是否有面试数据 */
const hasData = computed(() => interviewStore.history.length > 0)
/** 全局统计数据（来自 store） */
const stats = computed(() => interviewStore.overallStats)

/** 历史最高分 */
const bestScore = computed(() => {
  if (interviewStore.history.length === 0) return 0
  return Math.max(...interviewStore.history.map((h) => h.totalScore))
})

/** 面试记录按完成时间降序排列（最新的在前） */
const sortedHistory = computed(() =>
  [...interviewStore.history].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)),
)

/** 是否全选：所有记录都被勾选 */
const allChecked = computed(
  () =>
    sortedHistory.value.length > 0 && sortedHistory.value.every((r) => checkedIds.value.has(r.id)),
)

const checkedCount = computed(() => checkedIds.value.size)
const isAnyChecked = computed(() => checkedCount.value > 0)

/** 全选/取消全选 */
function toggleCheckAll() {
  if (allChecked.value) {
    checkedIds.value = new Set()
  } else {
    checkedIds.value = new Set(sortedHistory.value.map((r) => r.id))
  }
}

/** 切换单条记录的选中状态 */
function toggleCheck(id) {
  const s = new Set(checkedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  checkedIds.value = s
}

/** 进入批量删除模式 */
function enterDeleteMode() {
  isDeleteMode.value = true
  checkedIds.value = new Set()
}

/** 退出批量删除模式 */
function exitDeleteMode() {
  isDeleteMode.value = false
  checkedIds.value = new Set()
}

/** 点击"删除"按钮 → 打开确认弹窗 */
function confirmDelete() {
  if (!isAnyChecked.value) return
  showDeleteConfirm.value = true
}

/** 执行批量删除 */
function executeDelete() {
  interviewStore.deleteHistoryRecords([...checkedIds.value])
  showDeleteConfirm.value = false
  exitDeleteMode()
}

/** 删除当前选中的记录 */
function deleteSelectedRecord() {
  if (!selectedRecord.value) return
  interviewStore.deleteHistoryRecord(selectedRecord.value.id)
  selectedRecordId.value = null
}

/** 图表主题色前缀（indigo-500），后接透明度值拼接成完整 rgba */
const chartAccent = 'rgba(99, 102, 241,'
/** 图表网格线颜色 */
const chartGridColor = 'rgba(148, 163, 184, 0.12)'

/**
 * 渲染得分趋势折线图
 * 平滑曲线 + 面积填充，每点按分数着色
 */
function renderLineChart() {
  if (!barCanvas.value) return
  if (barChart) barChart.destroy()
  const trend = stats.value?.scoreTrend
  if (!trend || trend.length === 0) return
  barChart = new Chart(barCanvas.value, {
    type: 'line',
    data: {
      labels: trend.map((t) => t.date),
      datasets: [
        {
          label: '总分',
          data: trend.map((t) => t.score),
          borderColor: `${chartAccent} 0.8)`,
          backgroundColor: `${chartAccent} 0.08)`,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: trend.map((t) =>
            t.score >= 8
              ? `${chartAccent} 1)`
              : t.score >= 5
                ? 'rgba(245, 158, 11, 1)'
                : 'rgba(239, 68, 68, 1)',
          ),
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          min: 0,
          max: 10,
          ticks: { stepSize: 2, font: { size: 10, family: 'inherit' }, color: '#94a3b8' },
          grid: { color: chartGridColor },
          border: { display: false },
        },
        x: {
          ticks: { font: { size: 10, family: 'inherit' }, color: '#94a3b8' },
          grid: { display: false },
          border: { display: false },
        },
      },
      plugins: { legend: { display: false } },
    },
  })
}

// 趋势数据变化时重新渲染
watch(
  () => stats.value,
  () => requestAnimationFrame(renderLineChart),
  { deep: true },
)
onMounted(() => {
  requestAnimationFrame(() => renderLineChart())
})
onUnmounted(() => {
  if (barChart) barChart.destroy()
})

/** 点击导出菜单遮罩层关闭 */
function handleExportBackdropClick(e) {
  if (e.target === e.currentTarget) showExportMenu.value = false
}
</script>

<template>
  <div class="flex h-full flex-col overflow-y-auto thin-scrollbar">
    <div class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <!-- 空状态 -->
      <div v-if="!hasData" class="flex flex-col items-center justify-center py-24 text-text-muted">
        <div
          class="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-elevated ring-1 ring-border"
        >
          <Icon icon="lucide:bar-chart-3" class="h-10 w-10 opacity-25" />
        </div>
        <p class="text-sm font-medium text-text-secondary">暂无面试记录</p>
        <p class="mt-1.5 text-xs">完成一次模拟面试后将在这里看到学习数据统计</p>
      </div>

      <template v-else>
        <!-- 概览条 -->
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-text-primary">面试记录</h2>
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary"
              @click="showExportMenu = !showExportMenu"
            >
              <Icon icon="lucide:download" class="h-3.5 w-3.5" />
              导出
            </button>
            <Teleport to="body">
              <div
                v-if="showExportMenu"
                class="fixed inset-0 z-[999]"
                @click="handleExportBackdropClick"
              />
            </Teleport>
            <Transition name="export-menu">
              <div
                v-if="showExportMenu"
                class="absolute right-0 top-full z-[1001] mt-1 overflow-hidden rounded-xl border border-border bg-surface-elevated p-1 shadow-lg"
              >
                <button
                  type="button"
                  class="block w-full rounded-lg px-4 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary whitespace-nowrap"
                  @click="handleExport('md')"
                >
                  Markdown (.md)
                </button>
                <button
                  type="button"
                  class="block w-full rounded-lg px-4 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary whitespace-nowrap"
                  @click="handleExport('txt')"
                >
                  纯文本 (.txt)
                </button>
                <button
                  type="button"
                  class="block w-full rounded-lg px-4 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-surface-input hover:text-text-primary whitespace-nowrap"
                  @click="handleExport('json')"
                >
                  JSON (.json)
                </button>
              </div>
            </Transition>
          </div>
        </div>
        <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 animate-fade-up">
          <div class="stat-card rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              面试次数
            </div>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-bold text-text-primary tracking-tight sm:text-3xl">{{
                stats?.totalInterviews || 0
              }}</span>
              <span class="text-xs text-text-muted">次</span>
            </div>
            <div class="mt-3 h-1 w-full rounded-full bg-surface-input">
              <div
                class="h-full rounded-full bg-primary"
                :style="{ width: Math.min((stats?.totalInterviews || 0) * 10, 100) + '%' }"
              />
            </div>
          </div>

          <div class="stat-card rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              平均分
            </div>
            <div class="flex items-baseline gap-1">
              <span
                class="text-2xl font-bold tracking-tight sm:text-3xl"
                :class="getScoreColor(stats?.avgScore || 0)"
                >{{ stats?.avgScore || 0 }}</span
              >
              <span class="text-xs text-text-muted">/10</span>
            </div>
            <div class="mt-3 h-1 w-full rounded-full bg-surface-input">
              <div
                class="h-full rounded-full transition-all duration-700"
                :class="getScoreBgSolid(stats?.avgScore || 0)"
                :style="{ width: (stats?.avgScore || 0) * 10 + '%' }"
              />
            </div>
          </div>

          <div class="stat-card rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              最高分
            </div>
            <div class="flex items-baseline gap-1">
              <span
                class="text-2xl font-bold tracking-tight sm:text-3xl"
                :class="getScoreColor(bestScore)"
                >{{ bestScore }}</span
              >
              <span class="text-xs text-text-muted">/10</span>
            </div>
            <div class="mt-3 h-1 w-full rounded-full bg-surface-input">
              <div
                class="h-full rounded-full transition-all duration-700"
                :class="getScoreBgSolid(bestScore)"
                :style="{ width: bestScore * 10 + '%' }"
              />
            </div>
          </div>
        </div>

        <!-- 得分趋势 -->
        <div class="mb-8 animate-fade-up stagger-2">
          <div class="rounded-2xl border border-border bg-surface-elevated p-5">
            <h3 class="mb-4 text-sm font-semibold text-text-primary">得分趋势</h3>
            <div v-if="stats?.scoreTrend && stats.scoreTrend.length > 0">
              <canvas ref="barCanvas" />
            </div>
            <p v-else class="py-10 text-center text-xs text-text-muted">
              完成多次面试后可查看得分趋势
            </p>
          </div>
        </div>

        <!-- 面试记录 -->
        <div
          class="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6 animate-fade-up stagger-4"
        >
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-text-primary">面试记录</h3>
            <div class="flex items-center gap-2">
              <template v-if="isDeleteMode">
                <label
                  class="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  <input
                    type="checkbox"
                    class="h-3.5 w-3.5 rounded border-border accent-primary"
                    :checked="allChecked"
                    @change="toggleCheckAll"
                  />
                  全选
                </label>
                <button
                  type="button"
                  class="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-30"
                  :disabled="!isAnyChecked"
                  @click="confirmDelete"
                >
                  删除 ({{ checkedCount }})
                </button>
                <button
                  type="button"
                  class="rounded-lg px-2 py-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
                  @click="exitDeleteMode"
                >
                  取消
                </button>
              </template>
              <button
                v-else
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                @click="enterDeleteMode"
              >
                管理记录
              </button>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="sortedHistory.length === 0" class="py-10 text-center text-xs text-text-muted">
            暂无面试记录
          </div>

          <!-- 双栏布局 -->
          <div v-else class="overflow-hidden rounded-xl border border-border" style="height: 65vh">
            <DualPaneLayout left-width="38%">
              <template #left>
                <div class="h-full">
                  <!-- 记录列表 -->
                  <div class="thin-scrollbar h-full overflow-y-auto">
                    <button
                      v-for="record in sortedHistory"
                      :key="record.id"
                      type="button"
                      class="w-full border-b border-border px-3 py-3 text-left transition-colors last:border-b-0"
                      :class="
                        selectedRecordId === record.id
                          ? 'bg-primary/5 border-l-2 border-l-primary'
                          : 'border-l-2 border-l-transparent hover:bg-surface'
                      "
                      @click="selectedRecordId = record.id"
                    >
                      <div class="flex items-center gap-3">
                        <label
                          v-if="isDeleteMode"
                          class="flex shrink-0 cursor-pointer items-center"
                          @click.stop
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 rounded border-border accent-primary"
                            :checked="checkedIds.has(record.id)"
                            @change="toggleCheck(record.id)"
                          />
                        </label>
                        <ScoreBadge :score="record.totalScore" size="sm" />
                        <div class="min-w-0 flex-1">
                          <div class="truncate text-sm font-medium text-text-primary">
                            {{ record.typeLabel || '面试记录' }}
                          </div>
                          <div class="mt-0.5 flex items-center gap-x-2 text-xs text-text-muted">
                            <span>{{
                              new Date(record.finishedAt).toLocaleDateString('zh-CN', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            }}</span>
                            <span>{{ (record.questions || []).length }} 题</span>
                          </div>
                        </div>
                        <Icon icon="lucide:chevron-right" class="h-4 w-4 text-text-muted" />
                      </div>
                    </button>
                  </div>
                </div>
              </template>

              <template #right>
                <!-- 未选择时的占位 -->
                <div
                  v-if="!selectedRecord"
                  class="flex h-full flex-col items-center justify-center text-text-muted"
                >
                  <Icon icon="lucide:file-search" class="mb-3 h-10 w-10 opacity-30" />
                  <p class="text-sm">选择左侧记录查看详情</p>
                </div>

                <!-- 选中记录详情 -->
                <div v-else class="thin-scrollbar h-full overflow-y-auto p-4 sm:p-5">
                  <!-- 摘要条 -->
                  <div class="mb-5 flex items-center gap-4 rounded-xl bg-surface p-4">
                    <ScoreBadge :score="selectedRecord.totalScore" size="lg" show-label />
                    <div>
                      <div class="text-sm font-medium text-text-primary">
                        {{ selectedRecord.typeLabel || '面试记录' }}
                      </div>
                      <div class="text-xs text-text-muted">
                        {{
                          new Date(selectedRecord.finishedAt).toLocaleDateString('zh-CN', {
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        }}
                        &nbsp;·&nbsp;{{ (selectedRecord.questions || []).length }} 题
                      </div>
                    </div>
                    <div class="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-input hover:text-primary"
                        title="导出此记录"
                        @click="exportRecords([selectedRecord], 'md')"
                      >
                        <Icon icon="lucide:download" class="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                        title="删除此记录"
                        @click="deleteSelectedRecord"
                      >
                        <Icon icon="lucide:trash-2" class="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <!-- 分类得分 -->
                  <div
                    v-if="Object.keys(getHistoryCategoryStats(selectedRecord)).length"
                    class="mb-5"
                  >
                    <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      分类得分
                    </h4>
                    <div class="grid grid-cols-3 gap-2">
                      <div
                        v-for="(score, cat) in getHistoryCategoryStats(selectedRecord)"
                        :key="cat"
                        class="rounded-lg border border-border bg-surface-elevated p-3 text-center"
                      >
                        <div class="text-xs text-text-muted capitalize">{{ cat }}</div>
                        <div class="mt-0.5 text-base font-semibold" :class="getScoreColor(score)">
                          {{ score }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 薄弱知识点 -->
                  <div
                    v-if="getHistoryWeakPoints(selectedRecord).length"
                    class="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
                  >
                    <h4 class="mb-2 text-xs font-semibold text-amber-500">需要加强</h4>
                    <div class="flex flex-wrap gap-1.5">
                      <span
                        v-for="wp in getHistoryWeakPoints(selectedRecord)"
                        :key="wp.knowledgePoint"
                        class="rounded-full border border-amber-500/20 bg-surface px-2.5 py-0.5 text-xs text-text-secondary"
                        >{{ wp.knowledgePoint }}（{{ wp.score }} 分）</span
                      >
                    </div>
                  </div>

                  <!-- 题目回顾 -->
                  <div>
                    <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      题目回顾
                    </h4>
                    <div class="space-y-3">
                      <QuestionReviewCard
                        v-for="(q, idx) in selectedRecord.questions || []"
                        :key="q.id"
                        :question="q"
                        :score="selectedRecord.scores[q.id]"
                        :answer="selectedRecord.answers[q.id]"
                        :conversations="selectedRecord.conversations[q.id] || []"
                        :index="idx"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </DualPaneLayout>
          </div>
        </div>
      </template>
    </div>

    <!-- 删除确认弹窗 -->
    <Modal
      :show="showDeleteConfirm"
      title="删除面试记录"
      confirm-text="确认删除"
      cancel-text="取消"
      confirm-variant="danger"
      @close="showDeleteConfirm = false"
      @confirm="executeDelete"
    >
      <p class="text-sm text-text-secondary">
        确定要删除选中的
        <span class="font-semibold text-text-primary">{{ checkedCount }}</span>
        条面试记录吗？此操作不可撤销。
      </p>
    </Modal>
  </div>
</template>

<style scoped>
/* Entrance animations */
.animate-fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.stagger-2 {
  animation-delay: 0.08s;
}
.stagger-3 {
  animation-delay: 0.16s;
}
.stagger-4 {
  animation-delay: 0.24s;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stat card micro-interaction */
.stat-card {
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

/* Modal */
.modal-enter-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-active > :not(style) {
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-leave-active {
  transition: opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-leave-active > :not(style) {
  transition:
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > :not(style) {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}
.modal-leave-to > :not(style) {
  opacity: 0;
  transform: scale(0.98);
}

/* Export menu */
.export-menu-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.export-menu-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.export-menu-enter-from {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}
.export-menu-leave-to {
  opacity: 0;
  transform: translateY(-2px) scale(0.98);
}
</style>
