import { defineStore } from "pinia"
import { ref } from "vue"
import {
  fetchKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  fetchKnowledgeBase,
  uploadFileToKB,
  deleteFileFromKB,
  generateFromKB,
} from "@/utils/knowledgeApi"

export const useKnowledgeStore = defineStore("knowledge", () => {
  const kbs = ref([])            // 知识库列表（摘要）
  const currentKB = ref(null)    // 当前选中的详情
  const loading = ref(false)
  const error = ref("")

  /** 加载知识库列表 */
  async function fetchKBs() {
    loading.value = true
    error.value = ""
    try {
      kbs.value = await fetchKnowledgeBases()
    } catch (err) {
      error.value = err.message || "加载知识库失败"
    } finally {
      loading.value = false
    }
  }

  /** 创建知识库 */
  async function createKB(name, description = "") {
    loading.value = true
    error.value = ""
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
    } catch (err) {
      error.value = err.message || "创建失败"
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 删除知识库 */
  async function deleteKB(id) {
    loading.value = true
    error.value = ""
    try {
      await deleteKnowledgeBase(id)
      kbs.value = kbs.value.filter((kb) => kb.id !== id)
      if (currentKB.value?.id === id) {
        currentKB.value = null
      }
    } catch (err) {
      error.value = err.message || "删除失败"
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 加载知识库详情 */
  async function fetchKB(id) {
    loading.value = true
    error.value = ""
    try {
      currentKB.value = await fetchKnowledgeBase(id)
    } catch (err) {
      error.value = err.message || "加载详情失败"
    } finally {
      loading.value = false
    }
  }

  /** 上传文件到知识库 */
  async function uploadFile(kbId, { name, type, content }) {
    loading.value = true
    error.value = ""
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
    } catch (err) {
      error.value = err.message || "上传失败"
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 删除知识库中的文件 */
  async function deleteFile(kbId, fileId) {
    loading.value = true
    error.value = ""
    try {
      await deleteFileFromKB(kbId, fileId)
      if (currentKB.value && currentKB.value.id === kbId) {
        currentKB.value.files = currentKB.value.files.filter((f) => f.id !== fileId)
      }
      const idx = kbs.value.findIndex((k) => k.id === kbId)
      if (idx !== -1) {
        kbs.value[idx].fileCount = Math.max(0, (kbs.value[idx].fileCount || 1) - 1)
      }
    } catch (err) {
      error.value = err.message || "删除失败"
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 基于知识库生成面试题 */
  async function generateQuestions(kbId, { questionCount = 5, difficulty = "all", model }) {
    loading.value = true
    error.value = ""
    try {
      return await generateFromKB(kbId, { questionCount, difficulty, model })
    } catch (err) {
      error.value = err.message || "生成题目失败"
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 清空当前选中 */
  function clearCurrent() {
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
    clearCurrent,
  }
})
