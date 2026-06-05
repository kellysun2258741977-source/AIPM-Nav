// 真实提供方：OpenAI 协议端点。封装三件事——
//   1) writePrompt：用「文本模型」把需求扩写成图像提示词（Chat Completions，流式 + JSON 输出）
//   2) generate：用「图像模型」文生图（/images/generations）
//   3) edit：用「图像模型」参考图改图（/images/edits，multipart）
//
// 默认图像模型 gpt-image-1 始终返回 b64_json；对 dall-e 系列自动切换参数（n=1、response_format 等）。

import { PROMPT_WRITER_SYSTEM, EDIT_WRITER_SYSTEM } from "./prompts.js";

/* 把「画面比例」映射到具体模型支持的尺寸 */
export function sizeFor(model, aspect) {
  const isDalle = /dall-?e/i.test(model || "");
  if (isDalle) {
    return { square: "1024x1024", landscape: "1792x1024", portrait: "1024x1792" }[aspect] || "1024x1024";
  }
  // gpt-image-1
  return { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" }[aspect] || "1024x1024";
}

/* dall-e-3 的质量取值不同（standard/hd），其余用 low/medium/high */
function qualityFor(model, quality) {
  const isDalle3 = /dall-?e-?3/i.test(model || "");
  if (isDalle3) return quality === "high" ? "hd" : "standard";
  return quality; // gpt-image-1: low | medium | high | auto
}

export function makeOpenAIProvider(cfg) {
  const baseURL = (cfg.baseURL || "https://api.openai.com/v1").replace(/\/$/, "");
  const imageModel = cfg.model || "gpt-image-1";
  const textModel = cfg.textModel || "gpt-4o-mini";
  const headers = { Authorization: `Bearer ${cfg.apiKey}` };

  async function chatJSON({ system, user, onToken }) {
    let res;
    try {
      res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          temperature: 0.7,
          stream: true,
          response_format: { type: "json_object" }
        })
      });
    } catch (e) {
      throw new Error(`文本模型请求失败：${e.message}（检查 Base URL / 网络 / CORS）`);
    }
    if (!res.ok || !res.body) {
      let detail = "";
      try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
      throw new Error(`文本模型返回 ${res.status}${detail ? "：" + detail : ""}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", content = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (let line of lines) {
        line = line.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let json; try { json = JSON.parse(data); } catch { continue; }
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) { content += delta; onToken && onToken(delta); }
      }
    }

    try {
      return JSON.parse(content);
    } catch {
      // 兜底：模型偶尔包了多余文本，抠出第一个 JSON 块
      const m = content.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch { /* fallthrough */ } }
      throw new Error("无法解析文本模型返回的提示词 JSON。");
    }
  }

  async function readImages(res) {
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
      throw new Error(`图像接口返回 ${res.status}${detail ? "：" + detail : ""}`);
    }
    const json = await res.json();
    const data = json.data || [];
    return data.map(d => d.b64_json
      ? `data:image/png;base64,${d.b64_json}`
      : d.url // dall-e 在未要求 b64 时可能返回 url
    ).filter(Boolean);
  }

  return {
    name: "openai",
    imageModel,
    textModel,

    async writePrompt({ requirement, mode, onToken }) {
      const system = mode === "edit" ? EDIT_WRITER_SYSTEM : PROMPT_WRITER_SYSTEM;
      const out = await chatJSON({ system, user: requirement, onToken });
      return {
        thought: out.thought || "",
        prompt: out.prompt || requirement,
        prompt_zh: out.prompt_zh || "",
        tips: Array.isArray(out.tips) ? out.tips : []
      };
    },

    async generate({ prompt, n, aspect, quality }) {
      const body = {
        model: imageModel,
        prompt,
        n: Math.max(1, Math.min(n || 1, 10)),
        size: sizeFor(imageModel, aspect),
        quality: qualityFor(imageModel, quality)
      };
      // dall-e-3 不支持 n>1，且需显式要求 b64
      if (/dall-?e-?3/i.test(imageModel)) { body.n = 1; body.response_format = "b64_json"; }
      if (/dall-?e-?2/i.test(imageModel)) { body.response_format = "b64_json"; delete body.quality; }

      let res;
      try {
        res = await fetch(`${baseURL}/images/generations`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } catch (e) {
        throw new Error(`图像请求失败：${e.message}（检查 Base URL / 网络 / CORS）`);
      }
      return readImages(res);
    },

    async edit({ prompt, images, n, aspect, quality }) {
      const form = new FormData();
      form.append("model", imageModel);
      form.append("prompt", prompt);
      form.append("n", String(Math.max(1, Math.min(n || 1, 10))));
      form.append("size", sizeFor(imageModel, aspect));
      if (!/dall-?e/i.test(imageModel)) form.append("quality", qualityFor(imageModel, quality));
      else form.append("response_format", "b64_json");
      // gpt-image-1 支持多张参考图；dall-e-2 仅一张
      (images || []).forEach(file => form.append("image[]", file, file.name || "image.png"));

      let res;
      try {
        res = await fetch(`${baseURL}/images/edits`, { method: "POST", headers, body: form });
      } catch (e) {
        throw new Error(`图像编辑请求失败：${e.message}（检查 Base URL / 网络 / CORS）`);
      }
      return readImages(res);
    }
  };
}
