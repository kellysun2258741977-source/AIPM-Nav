// 真实模型提供方：任何兼容 OpenAI Chat Completions 协议的端点（OpenAI / DeepSeek / 本地等）。
// 使用 SSE 流式输出（stream: true）：内容 token 通过 onToken 实时回调，
// 同时累积分片到达的 tool_calls，最终组装成一条完整的 assistant 消息。

// 按 HTTP 状态码把原始错误翻译成对用户友好的文案，帮助快速定位 BYOK 配置问题。
function friendlyError(status, detail) {
  const tail = detail ? `（${detail}）` : "";
  if (status === 401) return `Key 无效或已过期：请到「设置」检查 API Key 是否正确${tail}`;
  if (status === 403) return `该 Key 没有此模型的访问权限：请确认账号已开通对应模型/已完成组织验证${tail}`;
  if (status === 404) return `接口不存在：模型名或 Base URL 路径可能写错（当前模型/端点是否拼写正确？）${tail}`;
  if (status === 429) return `请求被限流或额度已用完：稍等片刻再试，或检查账号余额${tail}`;
  if (status >= 500)  return `模型服务暂时故障（${status}）：稍后重试${tail}`;
  return `模型接口返回 ${status}${detail ? "：" + detail : ""}`;
}

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
        throw new Error(`无法连接到模型接口：${e.message}。常见原因：Base URL 拼写错误、断网，或该端点不允许浏览器跨域（CORS）。`);
      }

      if (!res.ok || !res.body) {
        let detail = "";
        try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
        throw new Error(friendlyError(res.status, detail));
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
