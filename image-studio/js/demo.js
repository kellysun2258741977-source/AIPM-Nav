// 演示模式：零 Key 也能跑通完整工作流。
// writePrompt 用脚本化模板扩写；generate/edit 产出占位用的渐变 SVG，
// 把提示词写在画面上，方便在没有真实 Key 时演示「需求→提示词→出图→抽选」的全链路。

const PALETTES = [
  ["#9a3b2e", "#d98a72"], ["#3f6b4a", "#8bbd97"], ["#2f4858", "#86a8c9"],
  ["#7a5c3e", "#d8b88c"], ["#5b3a66", "#b78fc7"], ["#1f1d1a", "#6f6a62"]
];

const DIMS = { square: [1024, 1024], landscape: [1536, 1024], portrait: [1024, 1536] };

function esc(s) { return String(s).replace(/[<&>]/g, c => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" }[c])); }

function placeholder(prompt, aspect, seed) {
  const [w, h] = DIMS[aspect] || DIMS.square;
  const [c1, c2] = PALETTES[seed % PALETTES.length];
  const a = (seed * 47) % 360;
  const words = esc((prompt || "").slice(0, 64));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${a} .5 .5)">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${w * 0.72}" cy="${h * 0.28}" r="${Math.min(w, h) * 0.22}" fill="#ffffff" opacity="0.12"/>
  <rect x="${w * 0.08}" y="${h * 0.08}" width="${w * 0.84}" height="${h * 0.84}" fill="none" stroke="#ffffff" stroke-opacity="0.25" rx="24"/>
  <text x="50%" y="46%" fill="#ffffff" opacity="0.92" font-family="Georgia, serif" font-size="${Math.round(Math.min(w, h) * 0.05)}" font-weight="700" text-anchor="middle">DEMO 占位图</text>
  <text x="50%" y="54%" fill="#ffffff" opacity="0.8" font-family="sans-serif" font-size="${Math.round(Math.min(w, h) * 0.028)}" text-anchor="middle">#${seed + 1} · ${aspect}</text>
  <text x="50%" y="62%" fill="#ffffff" opacity="0.65" font-family="sans-serif" font-size="${Math.round(Math.min(w, h) * 0.022)}" text-anchor="middle">${words}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function makeDemoProvider() {
  return {
    name: "demo",
    imageModel: "demo-placeholder",
    textModel: "demo-writer",

    async writePrompt({ requirement, mode, onToken }) {
      const verb = mode === "edit" ? "edit" : "create";
      const thought = mode === "edit"
        ? "聚焦用户想改的部分，保持原图风格与构图一致再下指令。"
        : "补全主体、场景、构图、光线与艺术风格，把模糊需求钉成可出图的具体画面。";
      const prompt = `A polished, professional image to ${verb}: ${requirement}. `
        + `Clear focal subject, balanced composition, soft directional lighting, refined color palette, `
        + `high detail, clean background, modern editorial style, high quality.`;
      // 模拟流式：把思路逐字吐出来，复用同一套「可见思考」UI
      for (const ch of thought) { onToken && onToken(ch); await wait(12); }
      return {
        thought,
        prompt,
        prompt_zh: `围绕「${requirement}」展开：主体清晰、构图均衡、光线柔和、风格现代、画质精细。`,
        tips: ["可指定具体风格（如 水彩 / 3D / 摄影）", "可补充主色调", "可说明用途与画面比例"]
      };
    },

    async generate({ prompt, n, aspect }) {
      await wait(700);
      const count = Math.max(1, Math.min(n || 1, 10));
      return Array.from({ length: count }, (_, i) => placeholder(prompt, aspect, i));
    },

    async edit({ prompt, n, aspect }) {
      await wait(700);
      const count = Math.max(1, Math.min(n || 1, 10));
      return Array.from({ length: count }, (_, i) => placeholder("EDIT · " + prompt, aspect, i + 2));
    }
  };
}
