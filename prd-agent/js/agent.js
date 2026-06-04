// Agent 编排循环 —— 与具体 provider、具体 UI 解耦。
// 经典的 ReAct 循环：
//   调用模型(思考，逐 token 流式) → 拿到 tool_calls(行动) → 执行工具(观察) → 把观察喂回 → 循环
// 直到模型不再调用工具，给出最终回答。
//
// 「思考/回答」文本通过 provider 的 onToken 回调逐字流式呈现（真实模型为 SSE，
// 演示模式为模拟 token 流），两条路径共用同一套 UI。

import { SYSTEM_PROMPT, TOOLS } from "./prompts.js";

export async function runAgent({ idea, provider, handlers, maxSteps = 10 }) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `产品想法：${idea}` }
  ];

  for (let step = 0; step < maxSteps; step++) {
    // 开一个流式步骤：先按「思考」呈现，结束后再根据是否有工具调用定型
    const live = handlers.beginStream();

    let assistant;
    try {
      assistant = await provider.chat({
        messages,
        tools: TOOLS,
        onToken: (t) => live.push(t)
      });
    } catch (e) {
      live.cancel();
      throw e;
    }

    messages.push(assistant);
    const calls = assistant.tool_calls || [];

    // 有工具调用 → 这段文本是「思考」；否则是「最终交付」
    live.finalize(calls.length ? "think" : "answer");

    if (calls.length === 0) {
      handlers.onDone();
      return messages;
    }

    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); }
      catch { args = {}; }

      await handlers.onAction(call.function.name, args);
      const result = await handlers.executeTool(call.function.name, args);
      await handlers.onObservation(call.function.name, result, args);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result)
      });
    }
  }

  handlers.onDone();
  return messages;
}
