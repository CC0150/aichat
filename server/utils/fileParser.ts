import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'

export type ParsedFileType = 'pdf' | 'docx' | 'text'

export interface ParsedFile {
  name: string
  size: number
  type: ParsedFileType
  text: string
}

/** 按扩展名/ MIME 判定可解析类型；不支持返回 null */
export function detectType(name: string, mime?: string): ParsedFileType | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.doc')) return null // 旧版 .doc 二进制格式不支持
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.json') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.md')
  ) {
    return 'text'
  }
  if (mime && /(text\/plain|application\/json|text\/csv|application\/vnd.ms-excel)/.test(mime)) {
    return 'text'
  }
  return null
}

/** 最大解析页数（与前端 docParser 一致，控制内存） */
const MAX_PDF_PAGES = 30

/** 用 unpdf 提取 PDF 文本（Node 端封装好的 pdf.js，worker 无需手配） */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: false })
  const pages = Array.isArray(text) ? text : [text]
  return pages.slice(0, MAX_PDF_PAGES).join('\n')
}

/**
 * multer 默认按 latin1 解码 multipart 文件名，中文名会变乱码（字节被截断）。
 * 还原为 UTF-8：纯 ASCII 名原样返回（latin1 往返无损），仅对含非 ASCII 的名字做修复。
 */
export function fixFileName(name: string): string {
  if (!/[^\x00-\x7f]/.test(name || '')) return name
  try {
    const repaired = Buffer.from(name, 'latin1').toString('utf8')
    return repaired || name
  } catch {
    return name
  }
}

/** 解析单个文件 buffer，返回提取文本与类型 */
export async function parseFile(name: string, buffer: Buffer, mime?: string): Promise<ParsedFile> {
  const type = detectType(name, mime)
  if (!type) throw new Error(`不支持的文件类型：${name}`)

  let text = ''
  if (type === 'pdf') {
    text = await extractPdfText(buffer)
  } else if (type === 'docx') {
    const res = await mammoth.extractRawText({ buffer })
    text = res.value || ''
  } else {
    text = buffer.toString('utf-8')
  }

  return { name: fixFileName(name), size: buffer.length, type, text: text.trim() }
}

/** 批量解析（multer 内存文件） */
export async function parseFiles(
  files: Array<{ originalname: string; buffer: Buffer; mimetype?: string; size: number }>,
): Promise<ParsedFile[]> {
  return Promise.all(files.map((f) => parseFile(f.originalname, f.buffer, f.mimetype)))
}
