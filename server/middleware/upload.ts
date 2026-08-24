import multer from 'multer'
import type { NextFunction, Request, Response } from 'express'
import { detectType } from '../utils/fileParser'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/** 内存存储的 multer 实例：文件不过盘，直接进解析器 */
export const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 5 },
  fileFilter(_req, file, cb) {
    if (detectType(file.originalname, file.mimetype)) cb(null, true)
    else cb(new Error(`不支持的文件类型：${file.originalname}`))
  },
})

/** 把 multer / fileFilter 抛出的错误转为 4xx JSON */
export function uploadErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: '文件超过 10MB 上限' })
      return
    }
    res.status(400).json({ error: err.message })
    return
  }
  if (err?.message) {
    res.status(400).json({ error: err.message })
    return
  }
  next(err)
}
