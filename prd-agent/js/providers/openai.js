// 真实模型提供方：任何兼容 OpenAI Chat Completions 协议的端点（OpenAI / DeepSeek / 本地等）。
// 使用 SSE 流式输出（stream: true）：内容 token 通过 onToken 实时回调，
// 同时累积分片到达的 tool_calls，最终组装成一条完整的 assistant 消息。

export function makeOpenAIProvider(cfg) {
  const baseURL = (cfg.baseURL || "https://api.openai.com/v1").replace(/\/$/, "");

  return {
    name: "openai",
    async chat({ messages, tools, onToken }) {
      let res;
      try {
        res = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`
          },
          body: JSON.stringify({
            model: cfg.model || "gpt-4o-mini",
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.4,
            stream: true
          })
        });
      } catch (e) {
        throw new Error(`网络请求失败：${e.message}。请检查 Base URL、网络或 CORS 设置。`);
      }

      if (!res.ok || !res.body) {
        let detail = "";
        try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
        throw new Error(`模型接口返回 ${res.status}${detail ? "：" + detail : ""}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let content = "";
      const toolMap = new Map(); // index -> { id, name, args }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() || ""; // 保留可能不完整的最后一行
        for (let line of lines) {
          line = line.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;

          let json;
          try { json = JSON.parse(data); } catch { continue; }
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
            onToken && onToken(delta.content);
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const cur = toolMap.get(idx) || { id: "", name: "", args: "" };
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.name = tc.function.name;
              if (tc.function?.arguments) cur.args += tc.function.arguments;
              toolMap.set(idx, cur);
            }
          }
        }
      }

      const tool_calls = [...toolMap.values()].map(t => ({
        id: t.id || `call_${Math.random().toString(36).slice(2)}`,
        type: "function",
        function: { name: t.name, arguments: t.args || "{}" }
      }));

      return { role: "assistant", content, tool_calls };
    }
  };
}
