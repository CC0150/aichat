import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
  fetchKnowledgeBase,
  uploadFileToKB,
  deleteFileFromKB,
  generateFromKB,
} from '@/utils/knowledgeApi'
import type { KnowledgeBaseSummary, KnowledgeBase } from '@/types'

export const useKnowledgeStore = defineStore('knowledge', () => {
  const kbs = ref<KnowledgeBaseSummary[]>([]) // 知识库列表（摘要）
  const currentKB = ref<KnowledgeBase | null>(null) // 当前选中的详情
  const loading = ref(false)
  const error = ref('')

  /** 加载知识库列表 */
  async function fetchKBs(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      kbs.value = await fetchKnowledgeBases()
    } catch (err: any) {
      error.value = err.message || '加载知识库失败'
    } finally {
      loading.value = false
    }
  }

  /** 创建知识库 */
  async function createKB(name: string, description = ''): Promise<any> {
    loading.value = true
    error.value = ''
    try {
      const kb = await createKnowledgeBase({ name, description })
      kbs.value.unshift({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        fileCount: 0,
        createdAt: kb.createdAt,
      })
      return kb
    } catch (err: any) {
      error.value = err.message || '创建失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 删除知识库 */
  async function deleteKB(id: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await deleteKnowledgeBase(id)
      kbs.value = kbs.value.filter((kb) => kb.id !== id)
      if (currentKB.value?.id === id) {
        currentKB.value = null
      }
    } catch (err: any) {
      error.value = err.message || '删除失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 加载知识库详情 */
  async function fetchKB(id: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      currentKB.value = await fetchKnowledgeBase(id)
    } catch (err: any) {
      error.value = err.message || '加载详情失败'
    } finally {
      loading.value = false
    }
  }

  /** 上传文件到知识库 */
  async function uploadFile(
    kbId: string,
    { name, type, content }: { name: string; type: string; content: string },
  ): Promise<any> {
    loading.value = true
    error.value = ''
    try {
      const file = await uploadFileToKB(kbId, { name, type, content })
      // 更新当前详情
      if (currentKB.value && currentKB.value.id === kbId) {
        if (!currentKB.value.files) currentKB.value.files = []
        currentKB.value.files.push(file)
      }
      // 更新列表中的 fileCount
      const idx = kbs.value.findIndex((k) => k.id === kbId)
      if (idx !== -1) {
        kbs.value[idx].fileCount = (kbs.value[idx].fileCount || 0) + 1
      }
      return file
    } catch (err: any) {
      error.value = err.message || '上传失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 删除知识库中的文件 */
  async function deleteFile(kbId: string, fileId: string): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await deleteFileFromKB(kbId, fileId)
      if (currentKB.value && currentKB.value.id === kbId) {
        currentKB.value.files = currentKB.value.files.filter((f) => f.id !== fileId)
      }
      const idx = kbs.value.findIndex((k) => k.id === kbId)
      if (idx !== -1) {
        kbs.value[idx].fileCount = Math.max(0, (kbs.value[idx].fileCount || 1) - 1)
      }
    } catch (err: any) {
      error.value = err.message || '删除失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 更新知识库名称与描述 */
  async function updateKB(
    id: string,
    { name, description }: { name: string; description: string },
  ): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      await updateKnowledgeBase(id, { name, description })
      // 更新列表中的条目
      const listIdx = kbs.value.findIndex((k) => k.id === id)
      if (listIdx !== -1) {
        kbs.value[listIdx].name = name
        kbs.value[listIdx].description = description
      }
      // 更新当前详情
      if (currentKB.value?.id === id) {
        currentKB.value.name = name
        currentKB.value.description = description
      }
    } catch (err: any) {
      error.value = err.message || '更新失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 基于知识库生成面试题 */
  async function generateQuestions(
    kbId: string,
    {
      questionCount = 5,
      difficulty = 'all',
      model,
    }: { questionCount?: number; difficulty?: string; model?: string },
  ): Promise<any> {
    loading.value = true
    error.value = ''
    try {
      return await generateFromKB(kbId, { questionCount, difficulty, model })
    } catch (err: any) {
      error.value = err.message || '生成题目失败'
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 清空当前选中 */
  function clearCurrent(): void {
    currentKB.value = null
  }

  return {
    kbs,
    currentKB,
    loading,
    error,
    fetchKBs,
    createKB,
    deleteKB,
    fetchKB,
    uploadFile,
    deleteFile,
    generateQuestions,
    updateKB,
    clearCurrent,
  }
})
