import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth/mammoth.browser'

// 配置 pdf.js worker（适配 Vite 构建）
GlobalWorkerOptions.workerSrc = pdfWorkerSrc

/**
 * 从文件名中提取扩展名（小写、含点号）
 * @param {string} [name=''] - 文件名
 * @returns {string} 扩展名，如 '.pdf'、'.docx'，无扩展名时返回 ''
 */
function getExt(name = '') {
  const lower = name.toLowerCase()
  const i = lower.lastIndexOf('.')
  return i >= 0 ? lower.slice(i) : ''
}

/**
 * 解析 PDF 文件，提取纯文本
 * 最多解析前 30 页，每页以「【第 N 页】」分隔
 * @param {File} file - PDF 文件
 * @returns {Promise<string>} 抽取的纯文本
 */
async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  const maxPages = 30
  const total = Math.min(pdf.numPages, maxPages)
  let fullText = ''

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item) => item.str || '').join(' ')
    fullText += `\n\n【第 ${i} 页】\n${pageText}`
  }

  return fullText.trim()
}

/**
 * 解析 Word 文档（.docx），提取纯文本
 * 使用 mammoth 库，不保留格式
 * @param {File} file - Word 文件（仅支持 .docx）
 * @returns {Promise<string>} 抽取的纯文本
 */
async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return (result && result.value ? result.value : '').trim()
}

/**
 * 解析纯文本文件（TXT / MD / JSON / JS / TS 等）
 * 使用 File.text() 按 UTF-8 读取
 * @param {File} file - 文本文件
 * @returns {Promise<string>} 文件内容，已去除首尾空白
 */
async function parseTextFile(file) {
  const text = await file.text()
  return (text || '').trim()
}

/**
 * 解析上传的文档附件，抽取纯文本内容
 * 根据文件扩展名和 MIME 类型选择解析方式：
 * - PDF：pdfjs-dist，最多 30 页
 * - Word (.docx)：mammoth，提取纯文本
 * - 其他文本类（TXT / MD / JSON 等）：按 UTF-8 读取
 *
 * @param {File} file - 待解析的文件
 * @returns {Promise<{ name: string, text: string, type: 'pdf' | 'word' | 'text' }>}
 * @throws {Error} 文件为空或解析失败时抛出
 */
export async function parseFile(file) {
  if (!file) {
    throw new Error('文件为空')
  }
  const name = file.name || '未命名文件'
  const ext = getExt(name)
  const type = file.type || ''

  try {
    if (type === 'application/pdf' || ext === '.pdf') {
      const text = await parsePdf(file)
      return { name, text, type: 'pdf' }
    }

    if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === '.docx'
    ) {
      const text = await parseDocx(file)
      return { name, text, type: 'word' }
    }

    // 其它常见文本类：txt/md/json/js/ts 等
    const text = await parseTextFile(file)
    return { name, text, type: 'text' }
  } catch (err) {
    const msg = err?.message || String(err || '未知错误')
    throw new Error(`解析文件「${name}」失败：${msg}`)
  }
}

