/**
 * 文本清洗 —— 修复 PDF 解析产生的乱码
 *
 * pdfjs-dist 从 PDF 提取中文时会产生：
 * 1. 控制字符（\x00-\x1f 等 PDF 内部标记）
 * 2. 字符间多余空格（"响 应 式" → "响应式"）
 * 3. 页面/行号残留
 */

/**
 * 清洗 PDF 解析文本
 * @param {string} text - 原始文本
 * @returns {string} - 清洗后的文本
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return ''

  return (
    text
      // 1. 移除 PDF 控制字符（保留换行、空格、制表符）
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
      // 2. 移除多余的零宽字符和不可见字符
      .replace(/[​‌‍‎‏﻿]/g, '')
      // 3. 中文和英文数字之间保留正常间距，移除中文字符间的多余空格
      //    中文 + 空格 + 中文 → 直接连上
      .replace(/([一-鿿])\s+([一-鿿])/g, '$1$2')
      // 4. 中文字符间的多个空格
      .replace(/([一-鿿])\s{2,}([一-鿿])/g, '$1$2')
      // 5. 移除独立的行号（如 "1 2 3 4 5 ... 10 11 ..."）
      .replace(/\n\d+(\s+\d+){5,}\s*\n/g, '\n')
      // 6. 合并没有内容的空行（保留段落分隔）
      .replace(/\n{4,}/g, '\n\n\n')
      // 7. 移除 PDF 页面标记残留（如单独的 "【第 X 页】" 之前的多余换行）
      .replace(/\n{2,}(【第 \d+ 页】)/g, '\n\n$1')
      // 8. 规范化空格
      .replace(/[ \t]+/g, ' ')
      // 9. 首尾去空白
      .trim()
  )
}

module.exports = { normalizeText }
