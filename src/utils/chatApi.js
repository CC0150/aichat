const CHAT_API_URL = "/api/chat";

/**
 * 流式请求后端 Chat 补全
 * @param {{
 *   model: string
 *   messages: Array<{ role: 'user' | 'assistant'; content: string }>
 *   onChunk: (content: string) => void
 *   onError?: (message: string) => void
 * }} options
 * @returns {Promise<void>}
 */
export async function requestChatStream({ model, messages, onChunk, onError }) {
  const body = JSON.stringify({
    model,
    messages,
    stream: true,
  });

  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    let msg = `API 请求失败：${response.status} ${response.statusText}`;
    try {
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      const detail = data?.error?.message ?? data?.message ?? data?.error;
      if (detail)
        msg += `（${typeof detail === "string" ? detail : JSON.stringify(detail)}）`;
    } catch (_) {}
    onError?.(msg);
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        // 尝试解析 JSON
        const parsed = JSON.parse(data);
        // 检查响应格式
        if (
          parsed.choices &&
          parsed.choices[0] &&
          parsed.choices[0].delta &&
          parsed.choices[0].delta.content
        ) {
          // 智谱 API 格式
          const content = parsed.choices[0].delta.content;
          if (content) onChunk(content);
        } else if (parsed.content) {
          // 后端自定义格式
          const content = parsed.content;
          if (content) onChunk(content);
        }
      } catch (e) {
        // 忽略 JSON 解析错误，继续处理下一行
        console.debug("解析响应数据失败，忽略此行:", e);
      }
    }
  }
}
