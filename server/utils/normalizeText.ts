/**
 * 文本清洗 —— 修复 PDF 解析产生的乱码 + 清理代码/HTML 残留
 *
 * pdfjs-dist 从 PDF 提取中文时会产生：
 * 1. 控制字符（\x00-\x1f 等 PDF 内部标记）
 * 2. 字符间多余空格（"响 应 式" → "响应式"）
 * 3. 页面/行号残留
 * 4. 源码类 PDF 会混入 HTML/Vue 模板标签
 */

/**
 * 清洗 PDF 解析文本
 */
export function normalizeText(text: unknown): string {
  if (!text || typeof text !== 'string') return ''

  let cleaned = text

  // ---- 移除代码/HTML 标签（源码类 PDF 会混入大量标签碎片） ----
  // Vue 模板语法：{{ }}、v-if、v-for、@click、:prop 等
  cleaned = cleaned.replace(/\{\{[^}]*\}\}/g, ' ')
  cleaned = cleaned.replace(
    /\bv-(?:if|else-if|else|for|show|model|bind|on|html|text|cloak|once|pre)\b/g,
    ' ',
  )
  cleaned = cleaned.replace(/@\w+(?:\.\w+)*/g, ' ')
  cleaned = cleaned.replace(/:\w+(?:\.\w+)*=/g, ' ')
  // HTML 标签：<tag attr="..."> 或 </tag>
  cleaned = cleaned.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/g, ' ')
  // 自闭合标签残留（如 <br/>、<img ... />）
  cleaned = cleaned.replace(/<[a-zA-Z][a-zA-Z0-9-]*[^>]*\/\s*>/g, ' ')

  // ---- 原有清洗逻辑 ----
  // 1. 移除 PDF 控制字符（保留换行、空格、制表符）
  cleaned = cleaned.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  // 2. 移除多余的零宽字符和不可见字符
  cleaned = cleaned.replace(/[​‌‍‎‏﻿]/g, '')
  // 3. 中文 + 空格 + 中文 → 直接连上
  cleaned = cleaned.replace(/([一-鿿])\s+([一-鿿])/g, '$1$2')
  // 4. 中文字符间的多个空格
  cleaned = cleaned.replace(/([一-鿿])\s{2,}([一-鿿])/g, '$1$2')
  // 5. 移除独立的行号（如 "1 2 3 4 5 ... 10 11 ..."）
  cleaned = cleaned.replace(/\n\d+(\s+\d+){5,}\s*\n/g, '\n')
  // 6. 合并没有内容的空行（保留段落分隔）
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')
  // 7. 移除 PDF 页面标记残留（如单独的 "【第 X 页】" 之前的多余换行）
  cleaned = cleaned.replace(/\n{2,}(【第 \d+ 页】)/g, '\n\n$1')
  // 8. 规范化空格
  cleaned = cleaned.replace(/[ \t]+/g, ' ')
  // 9. 首尾去空白
  cleaned = cleaned.trim()

  return cleaned
}
