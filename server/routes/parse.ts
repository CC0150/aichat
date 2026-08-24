import { Router, type Request, type Response } from 'express'
import { parseUpload, uploadErrorHandler } from '../middleware/upload'
import { parseFiles } from '../utils/fileParser'

const router = Router()

/** POST /api/parse — 批量解析上传的原始文档，返回提取文本 */
router.post(
  '/',
  parseUpload.array('files', 5),
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) || []
    if (!files.length) {
      res.status(400).json({ error: '缺少文件' })
      return
    }
    try {
      const parsed = await parseFiles(files)
      res.json({ files: parsed })
    } catch (err: any) {
      res.status(400).json({ error: err.message || '解析失败' })
    }
  },
  uploadErrorHandler,
)

export default router
