// Agent 编排循环 —— 与具体 provider、具体 UI 解耦。
// 它只负责经典的 ReAct 式循环：
//   调用模型(思考) → 拿到 tool_calls(行动) → 执行工具(观察) → 把观察喂回 → 循环
// 直到模型不再调用工具，给出最终回答。
//
// handlers 由上层（main.js）注入，用于把每一步渲染到界面，并真正执行工具
// （比如「澄清」工具需要暂停、等待用户作答）。

import { SYSTEM_PROMPT, TOOLS } from "./prompts.js";

export async function runAgent({ idea, provider, handlers, maxSteps = 8 }) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `产品想法：${idea}` }
  ];

  for (let step = 0; step < maxSteps; step++) {
    const assistant = await provider.chat({ messages, tools: TOOLS });
    messages.push(assistant);

    // 渲染「思考」（assistant 的自然语言部分）
    if (assistant.content && assistant.content.trim()) {
      await handlers.onThought(assistant.content.trim());
    }

    const calls = assistant.tool_calls || [];

    // 没有工具调用 → 这是最终回答，循环结束
    if (calls.length === 0) {
      await handlers.onFinal(assistant.content?.trim() || "（已完成）");
      return messages;
    }

    // 逐个执行工具调用
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); }
      catch { args = {}; }

      await handlers.onAction(call.function.name, args);

      // 执行工具，得到「观察」结果（executeTool 可能是异步并等待用户输入）
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

  await handlers.onFinal("已达到最大步数上限，提前结束。");
  return messages;
}
