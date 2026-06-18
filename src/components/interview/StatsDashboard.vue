<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { useInterviewStore } from '@/stores/interview'
import { Icon } from '@iconify/vue'
import {
  getScoreColor,
  getScoreBg,
  getScoreBgSolid,
  getScoreBorder,
  getScoreLabel,
  difficultyMap,
  difficultyColor,
} from '@/utils/interviewHelpers'
import Modal from '@/components/Modal.vue'
import { exportRecords } from '@/utils/interviewExport'

Chart.register(...registerables)

const interviewStore = useInterviewStore()

const showExportMenu = ref(false)
const exportFormat = ref('md')

function handleExport(format) {
  exportFormat.value = format
  const records = interviewStore.history
  if (records.length === 0) return
  exportRecords(records, format)
  showExportMenu.value = false
}

const radarCanvas = ref(null)
const barCanvas = ref(null)
let radarChart = null
let barChart = null

// 详情弹窗
const detailRecord = ref(null)

// 删除模式
const isDeleteMode = ref(false)
const checkedIds = ref(new Set())
const showDeleteConfirm = ref(false)

const hasData = computed(() => interviewStore.history.length > 0)
const stats = computed(() => interviewStore.overallStats)

const bestScore = computed(() => {
  if (interviewStore.history.length === 0) return 0
  return Math.max(...interviewStore.history.map((h) => h.totalScore))
})

const overallCategoryStats = computed(() => {
  const map = {}
  for (const record of interviewStore.history) {
    for (const q of record.questions || []) {
      const s = record.scores[q.id]
      if (!s) continue
      if (!map[q.category]) map[q.category] = { total: 0, count: 0 }
      map[q.category].total += s.score || 0
      map[q.category].count += 1
    }
  }
  const result = {}
  for (const [cat, stat] of Object.entries(map)) {
    result[cat] = Math.round((stat.total / stat.count) * 10) / 10
  }
  return result
})

const latestRadarData = computed(() => {
  const kpStats = interviewStore.knowledgePointStats
  return {
    labels: Object.keys(kpStats),
    data: Object.values(kpStats),
  }
})

const sortedHistory = computed(() =>
  [...interviewStore.history].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)),
)

const allChecked = computed(
  () =>
    sortedHistory.value.length > 0 && sortedHistory.value.every((r) => checkedIds.value.has(r.id)),
)

const checkedCount = computed(() => checkedIds.value.size)
const isAnyChecked = computed(() => checkedCount.value > 0)

function toggleCheckAll() {
  if (allChecked.value) {
    checkedIds.value = new Set()
  } else {
    checkedIds.value = new Set(sortedHistory.value.map((r) => r.id))
  }
}

function toggleCheck(id) {
  const s = new Set(checkedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  checkedIds.value = s
}

function enterDeleteMode() {
  isDeleteMode.value = true
  checkedIds.value = new Set()
}

function exitDeleteMode() {
  isDeleteMode.value = false
  checkedIds.value = new Set()
}

function confirmDelete() {
  if (!isAnyChecked.value) return
  showDeleteConfirm.value = true
}

function executeDelete() {
  interviewStore.deleteHistoryRecords([...checkedIds.value])
  showDeleteConfirm.value = false
  exitDeleteMode()
}

function openDetail(record) {
  detailRecord.value = record
}

function closeDetail() {
  detailRecord.value = null
}

const chartAccent = 'rgba(99, 102, 241,'
const chartGridColor = 'rgba(148, 163, 184, 0.12)'

function renderRadarChart() {
  if (!radarCanvas.value) return
  if (radarChart) radarChart.destroy()
  const { labels, data } = latestRadarData.value
  if (labels.length === 0) return
  radarChart = new Chart(radarCanvas.value, {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: '得分',
          data,
          backgroundColor: `${chartAccent} 0.12)`,
          borderColor: `${chartAccent} 0.65)`,
          borderWidth: 2,
          pointBackgroundColor: `${chartAccent} 1)`,
          pointBorderColor: 'transparent',
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: { stepSize: 2, display: false, backdropColor: 'transparent' },
          grid: { color: chartGridColor },
          angleLines: { color: chartGridColor },
          pointLabels: {
            font: { size: 11, family: 'inherit' },
            color: '#94a3b8',
          },
        },
      },
      plugins: { legend: { display: false } },
    },
  })
}

function renderBarChart() {
  if (!barCanvas.value) return
  if (barChart) barChart.destroy()
  const trend = stats.value?.scoreTrend
  if (!trend || trend.length === 0) return
  barChart = new Chart(barCanvas.value, {
    type: 'bar',
    data: {
      labels: trend.map((t) => t.date),
      datasets: [
        {
          label: '总分',
          data: trend.map((t) => t.score),
          backgroundColor: trend.map((t) =>
            t.score >= 8
              ? `${chartAccent} 0.55)`
              : t.score >= 5
                ? 'rgba(245, 158, 11, 0.45)'
                : 'rgba(239, 68, 68, 0.4)',
          ),
          borderColor: trend.map((t) =>
            t.score >= 8
              ? `${chartAccent} 0.8)`
              : t.score >= 5
                ? 'rgba(245, 158, 11, 0.7)'
                : 'rgba(239, 68, 68, 0.65)',
          ),
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
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

watch(latestRadarData, () => requestAnimationFrame(renderRadarChart), { deep: true })
watch(
  () => stats.value,
  () => requestAnimationFrame(renderBarChart),
  { deep: true },
)
onMounted(() => {
  requestAnimationFrame(() => {
    renderRadarChart()
    renderBarChart()
  })
})
onUnmounted(() => {
  if (radarChart) radarChart.destroy()
  if (barChart) barChart.destroy()
})

// 详情弹窗
function detailCategoryStats(record) {
  const map = {}
  for (const q of record.questions || []) {
    const s = record.scores[q.id]
    if (!s) continue
    if (!map[q.category]) map[q.category] = { total: 0, count: 0 }
    map[q.category].total += s.score || 0
    map[q.category].count += 1
  }
  const result = {}
  for (const [cat, stat] of Object.entries(map)) {
    result[cat] = Math.round((stat.total / stat.count) * 10) / 10
  }
  return result
}

function detailWeakPoints(record) {
  const catStats = detailCategoryStats(record)
  return Object.entries(catStats)
    .filter(([, s]) => s < 5)
    .map(([cat, s]) => ({ knowledgePoint: cat, score: s }))
    .sort((a, b) => a.score - b.score)
}

function handleDetailBackdropClick(e) {
  if (e.target === e.currentTarget) closeDetail()
}

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
        <div class="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 animate-fade-up">
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

          <div class="stat-card rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
            <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              薄弱知识点
            </div>
            <div class="flex items-baseline gap-1">
              <span
                class="text-2xl font-bold tracking-tight sm:text-3xl"
                :class="
                  interviewStore.weakPoints.length === 0 ? 'text-emerald-500' : 'text-amber-500'
                "
              >
                {{ interviewStore.weakPoints.length }}
              </span>
              <span class="text-xs text-text-muted">项</span>
            </div>
            <div class="mt-3 flex gap-1 flex-wrap">
              <span
                v-for="wp in interviewStore.weakPoints.slice(0, 3)"
                :key="wp.knowledgePoint"
                class="truncate rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-500"
                >{{ wp.knowledgePoint }}</span
              >
              <span
                v-if="interviewStore.weakPoints.length > 3"
                class="text-[10px] text-text-muted self-center"
                >+{{ interviewStore.weakPoints.length - 3 }}</span
              >
              <span
                v-if="interviewStore.weakPoints.length === 0"
                class="text-[10px] text-emerald-500"
                >全部掌握</span
              >
            </div>
          </div>
        </div>

        <!-- 分析行：雷达图 + 分类得分 -->
        <div class="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px] animate-fade-up stagger-2">
          <!-- 左：雷达图 -->
          <div class="rounded-2xl border border-border bg-surface-elevated p-5 sm:p-6">
            <h3 class="mb-5 text-sm font-semibold text-text-primary">知识点掌握度</h3>
            <div v-if="latestRadarData.labels.length > 0" class="mx-auto" style="max-width: 360px">
              <canvas ref="radarCanvas" />
            </div>
            <p v-else class="py-12 text-center text-xs text-text-muted">
              完成面试后可查看知识点评分雷达图
            </p>
          </div>

          <!-- 右：全历史分类得分 -->
          <div class="rounded-2xl border border-border bg-surface-elevated p-5">
            <h3 class="mb-4 text-sm font-semibold text-text-primary">分类得分总览</h3>
            <div v-if="Object.keys(overallCategoryStats).length" class="space-y-3">
              <div
                v-for="(score, cat) in overallCategoryStats"
                :key="cat"
                class="flex items-center gap-3"
              >
                <span class="w-16 shrink-0 text-xs capitalize text-text-muted">{{ cat }}</span>
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-input">
                  <div
                    class="h-full rounded-full transition-all duration-700"
                    :class="getScoreBgSolid(score)"
                    :style="{ width: score * 10 + '%' }"
                  />
                </div>
                <span
                  class="w-8 shrink-0 text-right text-xs font-semibold"
                  :class="getScoreColor(score)"
                  >{{ score }}</span
                >
              </div>
              <p class="text-[11px] text-text-muted mt-3">
                综合 {{ stats?.totalInterviews || 0 }} 次面试数据
              </p>
            </div>
            <p v-else class="py-8 text-center text-xs text-text-muted">暂无分类数据</p>
          </div>
        </div>

        <!-- 洞察行：趋势图 + 薄弱分析 -->
        <div class="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2 animate-fade-up stagger-3">
          <div class="rounded-2xl border border-border bg-surface-elevated p-5">
            <h3 class="mb-4 text-sm font-semibold text-text-primary">得分趋势</h3>
            <div v-if="stats?.scoreTrend && stats.scoreTrend.length > 0">
              <canvas ref="barCanvas" />
            </div>
            <p v-else class="py-10 text-center text-xs text-text-muted">
              完成多次面试后可查看得分趋势
            </p>
          </div>

          <div class="rounded-2xl border border-border bg-surface-elevated p-5">
            <h3 class="mb-4 text-sm font-semibold text-text-primary">薄弱项与建议</h3>
            <template v-if="interviewStore.weakPoints.length">
              <div class="space-y-2">
                <div
                  v-for="wp in interviewStore.weakPoints.slice(0, 6)"
                  :key="wp.knowledgePoint"
                  class="flex items-center gap-3 rounded-lg bg-surface p-2.5"
                >
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    :class="getScoreBgSolid(wp.score)"
                  >
                    {{ wp.score }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-text-primary truncate">
                      {{ wp.knowledgePoint }}
                    </div>
                  </div>
                  <span class="shrink-0 text-[11px] font-medium" :class="getScoreColor(wp.score)">{{
                    getScoreLabel(wp.score)
                  }}</span>
                </div>
              </div>
            </template>
            <div v-else class="flex flex-col items-center py-8 text-center">
              <Icon icon="lucide:check-circle" class="mb-2 h-8 w-8 text-emerald-500/60" />
              <p class="text-xs text-text-muted">暂无薄弱项</p>
              <p class="mt-0.5 text-[11px] text-text-muted">完成更多面试以发现知识盲区</p>
            </div>
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

          <div v-if="sortedHistory.length === 0" class="py-10 text-center text-xs text-text-muted">
            暂无面试记录
          </div>

          <div class="space-y-1.5">
            <div
              v-for="record in sortedHistory"
              :key="record.id"
              class="history-row group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-surface"
            >
              <label v-if="isDeleteMode" class="flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded border-border accent-primary"
                  :checked="checkedIds.has(record.id)"
                  @change="toggleCheck(record.id)"
                />
              </label>

              <!-- 分数 -->
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white transition-transform duration-200 group-hover:scale-105"
                :class="getScoreBgSolid(record.totalScore)"
              >
                {{ record.totalScore }}
              </div>

              <!-- 信息 -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium text-text-primary">{{
                    record.typeLabel || '面试记录'
                  }}</span>
                </div>
                <div
                  class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted"
                >
                  <span>{{
                    new Date(record.finishedAt).toLocaleDateString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }}</span>
                  <span class="opacity-30 hidden sm:inline">|</span>
                  <span class="hidden sm:inline">{{ (record.questions || []).length }} 题</span>
                  <span
                    class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    :class="getScoreColor(record.totalScore)"
                  >
                    {{ getScoreLabel(record.totalScore) }}
                  </span>
                </div>
              </div>

              <button
                v-if="!isDeleteMode"
                type="button"
                class="shrink-0 rounded-lg px-3 py-1.5 text-xs text-text-muted transition-all duration-200 hover:bg-surface-input hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
                @click="openDetail(record)"
              >
                详情
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 详情弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="detailRecord"
          class="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-10"
          @click="handleDetailBackdropClick"
        >
          <div
            class="mx-4 my-auto w-full max-w-2xl rounded-2xl border border-border bg-surface-elevated shadow-xl"
          >
            <div
              class="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4"
            >
              <div>
                <h3 class="text-base font-semibold text-text-primary">
                  {{ detailRecord.typeLabel || '面试记录' }}
                </h3>
                <p class="mt-0.5 text-xs text-text-muted">
                  {{
                    new Date(detailRecord.finishedAt).toLocaleDateString('zh-CN', {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  }}
                  &nbsp;·&nbsp;{{ (detailRecord.questions || []).length }} 题
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-input hover:text-text-primary"
                @click="closeDetail"
              >
                <Icon icon="lucide:x" class="h-5 w-5" />
              </button>
            </div>

            <div class="max-h-[70vh] overflow-y-auto px-4 py-4 thin-scrollbar sm:px-6 sm:py-5">
              <div class="mb-5 flex items-center gap-4 rounded-xl bg-surface p-4">
                <div
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
                  :class="getScoreBgSolid(detailRecord.totalScore)"
                >
                  {{ detailRecord.totalScore }}
                </div>
                <div>
                  <div class="text-sm font-medium text-text-primary">
                    总分 <span class="text-text-muted">/10</span>
                  </div>
                  <div class="text-xs" :class="getScoreColor(detailRecord.totalScore)">
                    {{ getScoreLabel(detailRecord.totalScore) }}
                  </div>
                </div>
              </div>

              <div v-if="Object.keys(detailCategoryStats(detailRecord)).length" class="mb-5">
                <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  分类得分
                </h4>
                <div class="grid grid-cols-3 gap-2">
                  <div
                    v-for="(score, cat) in detailCategoryStats(detailRecord)"
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

              <div
                v-if="detailWeakPoints(detailRecord).length"
                class="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
              >
                <h4 class="mb-2 text-xs font-semibold text-amber-500">需要加强</h4>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="wp in detailWeakPoints(detailRecord)"
                    :key="wp.knowledgePoint"
                    class="rounded-full border border-amber-500/20 bg-surface px-2.5 py-0.5 text-xs text-text-secondary"
                    >{{ wp.knowledgePoint }}（{{ wp.score }} 分）</span
                  >
                </div>
              </div>

              <div>
                <h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  题目回顾
                </h4>
                <div class="space-y-3">
                  <div
                    v-for="(q, idx) in detailRecord.questions || []"
                    :key="q.id"
                    class="rounded-xl border border-border bg-surface p-4"
                  >
                    <div class="mb-2 flex flex-wrap items-center gap-2">
                      <span class="text-xs font-medium text-text-muted">Q{{ idx + 1 }}</span>
                      <span
                        class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        :class="difficultyColor[q.difficulty] || 'bg-surface-input text-text-muted'"
                        >{{ difficultyMap[q.difficulty] || q.difficulty }}</span
                      >
                      <span
                        v-for="tag in q.tags || []"
                        :key="tag"
                        class="rounded-full bg-surface-input px-2 py-0.5 text-[11px] text-text-muted"
                        >{{ tag }}</span
                      >
                      <span
                        class="ml-auto text-sm font-semibold"
                        :class="getScoreColor((detailRecord.scores[q.id] || {}).score || 0)"
                      >
                        {{ (detailRecord.scores[q.id] || {}).score ?? '-' }}/10
                      </span>
                    </div>
                    <p class="text-sm text-text-primary leading-relaxed">{{ q.question }}</p>

                    <!-- 多轮对话记录 -->
                    <div
                      v-if="(detailRecord.conversations[q.id] || []).length > 0"
                      class="mt-3 space-y-2"
                    >
                      <div class="mb-1.5 text-[11px] font-medium text-text-muted">对话记录</div>
                      <div
                        v-for="(msg, mi) in detailRecord.conversations[q.id]"
                        :key="mi"
                        class="flex"
                        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
                      >
                        <div
                          class="max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed"
                          :class="
                            msg.role === 'user'
                              ? 'bg-primary/10 text-text-primary'
                              : 'bg-surface-input text-text-secondary'
                          "
                        >
                          <span
                            class="text-xs font-medium"
                            :class="msg.role === 'user' ? 'text-primary' : 'text-text-muted'"
                          >
                            {{
                              msg.role === 'user'
                                ? '你'
                                : `AI 追问 (第${Math.ceil((mi + 1) / 2)}轮)`
                            }}
                          </span>
                          <p class="mt-0.5 whitespace-pre-wrap">{{ msg.content }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- 普通模式的回答（无追问对话时使用） -->
                    <div
                      v-else-if="detailRecord.answers[q.id]"
                      class="mt-3 rounded-lg bg-surface-input px-4 py-3"
                    >
                      <div class="mb-1.5 text-[11px] font-medium text-text-muted">你的回答</div>
                      <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                        {{ detailRecord.answers[q.id] }}
                      </p>
                    </div>

                    <div
                      v-if="(detailRecord.scores[q.id] || {}).feedback"
                      class="mt-3 flex items-start gap-1.5 text-xs text-text-muted"
                    >
                      <Icon icon="lucide:message-circle" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span class="leading-relaxed">{{
                        (detailRecord.scores[q.id] || {}).feedback
                      }}</span>
                    </div>

                    <div
                      v-if="(detailRecord.scores[q.id] || {}).improvedAnswer"
                      class="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
                    >
                      <div class="mb-1.5 text-[11px] font-medium text-emerald-500">参考回答</div>
                      <p class="text-sm text-text-secondary leading-relaxed">
                        {{ (detailRecord.scores[q.id] || {}).improvedAnswer }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

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
