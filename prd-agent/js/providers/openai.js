// 真实模型提供方：任何兼容 OpenAI Chat Completions 协议的端点（OpenAI / DeepSeek / 本地等）。
// 通过标准的 tools / tool_calls function-calling 驱动 Agent 循环。

export function makeOpenAIProvider(cfg) {
  const baseURL = (cfg.baseURL || "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    name: "openai",
    async chat({ messages, tools }) {
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
            temperature: 0.4
          })
        });
      } catch (e) {
        throw new Error(`网络请求失败：${e.message}。请检查 Base URL、网络或 CORS 设置。`);
      }

      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
        throw new Error(`模型接口返回 ${res.status}${detail ? "：" + detail : ""}`);
      }

      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error("模型返回为空，请稍后重试或检查模型名是否正确。");

      return {
        role: "assistant",
        content: msg.content || "",
        tool_calls: msg.tool_calls || []
      };
    }
  };
}
