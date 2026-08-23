import { openai } from '../config'

/**
 * 调用 DeepSeek API 流式补全，逐个产出 content 片段
 */
export async function* streamChat(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create(
    {
      model,
      messages: messages as any[],
      stream: true,
    },
    { signal },
  )

  for await (const chunk of stream) {
    const content = (chunk.choices?.[0]?.delta as any)?.content
    if (content != null && content !== '') {
      yield String(content)
    }
  }
}
