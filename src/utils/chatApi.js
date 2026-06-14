const CHAT_API_URL = "http://localhost:8787/api/chat";

/**
 * 流式请求后端 Chat 补全
 * @param {{
 *   model: string
 *   messages: Array<{ role: 'user' | 'assistant'; content: string }>
 *   onChunk: (content: string) => void
 *   onError?: (message: string) => void
 *   signal?: AbortSignal
 * }} options
 * @returns {Promise<void>}
 */
export async function requestChatStream({ model, messages, onChunk, onError, signal }) {
  const body = JSON.stringify({
    model,
    messages,
    stream: true,
  });

  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream; charset=utf-8",
    },
    body,
    signal,
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
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunkText = decoder.decode(value, { stream: true });
    
    buffer += chunkText;
    

    while (true) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const rawLine = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);

      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trimStart(); // "data: " 后面的内容

      if (data === "[DONE]") {
        try {
          await reader.cancel();
        } catch (_) {}
        return;
      }

      try {
        const parsed = JSON.parse(data);
        // 后端错误：空消息、API 失败等会返回 { error: "..." }
        if (parsed?.error) {
          onError?.(String(parsed.error));
          return;
        }
        // 双重兼容：优先 parsed.content（后端标准化格式），其次 parsed.choices[0].delta.content
        const content =
          parsed.content ??
          parsed.choices?.[0]?.delta?.content ??
          null;
        if (content != null && content !== "") {
          onChunk(String(content));
        }
      } catch (e) {
        // 忽略 JSON 解析错误，继续处理下一行
        console.debug("解析响应数据失败，忽略此行:", e);
      }
    }
  }
}
