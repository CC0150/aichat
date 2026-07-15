const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY

/**
 * 调用 OpenAI 兼容的 embedding 接口，将文本转为向量
 * @param {string|string[]} input - 待向量化的文本，支持单条或批量
 * @returns {Promise<number[][]>} - 向量数组，即使单条输入也返回二维数组
 */
async function getEmbedding(input) {
  // 懒校验：只在真正调用时才检查配置（避免 require 时就抛错）
  if (!EMBEDDING_API_KEY || !EMBEDDING_BASE_URL || !EMBEDDING_MODEL) {
    throw new Error(
      '缺少 embedding 配置，请检查 server/.env 中是否已设置 EMBEDDING_API_KEY、EMBEDDING_BASE_URL、EMBEDDING_MODEL'
    )
  }

  const texts = Array.isArray(input) ? input : [input]
  if (texts.length === 0 || texts.some((t) => !t || typeof t !== 'string')) {
    throw new Error('embedding 输入文本不能为空')
  }

  const response = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Embedding API 请求失败（状态码 ${response.status}）：${body}`)
  }

  const json = await response.json()

  if (!json?.data?.length) {
    throw new Error(`Embedding API 返回结构异常：${JSON.stringify(json)}`)
  }

  return json.data.map((d) => d.embedding)
}

module.exports = { getEmbedding }
