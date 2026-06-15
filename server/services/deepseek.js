const { openai } = require("../config");

/**
 * 调用 DeepSeek API 流式补全，逐个产出 content 片段
 * @param {string} model
 * @param {Array<{role:string,content:any}>} messages
 * @returns {AsyncGenerator<string>}
 */
async function* streamChat(model, messages) {
  const stream = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content != null && content !== "") {
      yield String(content);
    }
  }
}

module.exports = { streamChat };
