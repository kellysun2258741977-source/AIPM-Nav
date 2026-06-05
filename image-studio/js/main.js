// 应用入口：主题 / BYOK 设置 / 文生图·改图切换 / 提示词模板 / 本地历史 / 工作流编排。

import { runPipeline } from "./pipeline.js";
import { createUI } from "./ui.js";
import { makeDemoProvider } from "./demo.js";
import { makeOpenAIProvider } from "./openai.js";
import { TEMPLATES, EDIT_TEMPLATES } from "./prompts.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } },
};
const KEY = { theme: "imgstudio.theme", settings: "imgstudio.settings", history: "imgstudio.history" };

const PRESETS = {
  demo:   { baseURL: "", model: "", textModel: "" },
  openai: { baseURL: "https://api.openai.com/v1", model: "gpt-image-1", textModel: "gpt-4o-mini" },
  custom: { baseURL: "", model: "", textModel: "" }
};

let ui = null;
let running = false;
let mode = "generate";          // generate | edit
let editFiles = [];             // File[] for edit mode

/* ───────── 主题 ───────── */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("themeBtn").textContent = t === "dark" ? "☀" : "☾";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === "dark" ? "#131210" : "#f0ede8";
}
function initTheme() {
  let t = store.get(KEY.theme, null);
  if (!t) t = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(t);
}
$("themeBtn").addEventListener("click", () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(t); store.set(KEY.theme, t);
});
// 跟随系统：未手动设置主题时，系统切换深/浅色即实时跟随
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSysTheme = (e) => { if (store.get(KEY.theme, null) === null) applyTheme(e.matches ? "dark" : "light"); };
  if (mq.addEventListener) mq.addEventListener("change", onSysTheme);
  else if (mq.addListener) mq.addListener(onSysTheme);
}

/* ───────── 设置 / BYOK ───────── */
function getSettings() { return store.get(KEY.settings, { preset: "demo", baseURL: "", apiKey: "", model: "", textModel: "" }); }
function isLive(s) { return !!(s && s.preset !== "demo" && s.apiKey && s.baseURL); }

function refreshModeBadge() {
  const s = getSettings();
  const badge = $("modeBadge"), hint = $("composerHint");
  if (isLive(s)) {
    badge.textContent = `真实模型 · ${s.model || "gpt-image-1"}`;
    badge.className = "badge badge-live";
    hint.textContent = `已接入真实模型：文本模型 ${s.textModel || "gpt-4o-mini"} 写提示词，图像模型 ${s.model || "gpt-image-1"} 出图。`;
  } else {
    badge.textContent = "演示模式";
    badge.className = "badge badge-demo";
    hint.textContent = "演示模式无需 Key，出占位图即可体验完整工作流。点 ⚙ 填入你自己的 OpenAI Key 即可真实出图。";
  }
}

function openSettings() {
  const s = getSettings();
  $("baseUrl").value = s.baseURL || "";
  $("apiKey").value = s.apiKey || "";
  $("modelName").value = s.model || "";
  $("textModelName").value = s.textModel || "";
  selectPresetUI(s.preset || "demo");
  $("settingsModal").hidden = false;
}
const closeSettings = () => { $("settingsModal").hidden = true; };

function selectPresetUI(preset) {
  document.querySelectorAll("#presetSeg .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.preset === preset));
  if (preset !== "custom" && PRESETS[preset]) {
    $("baseUrl").value = PRESETS[preset].baseURL;
    $("modelName").value = PRESETS[preset].model;
    $("textModelName").value = PRESETS[preset].textModel;
  }
}

$("settingsBtn").addEventListener("click", openSettings);
$("settingsClose").addEventListener("click", closeSettings);
$("settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });
document.querySelectorAll("#presetSeg .seg-btn").forEach(b => b.addEventListener("click", () => selectPresetUI(b.dataset.preset)));

$("saveSettings").addEventListener("click", () => {
  const preset = document.querySelector("#presetSeg .seg-btn.active")?.dataset.preset || "demo";
  store.set(KEY.settings, {
    preset,
    baseURL: $("baseUrl").value.trim(),
    apiKey: $("apiKey").value.trim(),
    model: $("modelName").value.trim(),
    textModel: $("textModelName").value.trim()
  });
  refreshModeBadge();
  closeSettings();
});
$("clearKeyBtn").addEventListener("click", () => {
  store.set(KEY.settings, { preset: "demo", baseURL: "", apiKey: "", model: "", textModel: "" });
  ["baseUrl", "apiKey", "modelName", "textModelName"].forEach(id => $(id).value = "");
  selectPresetUI("demo");
  refreshModeBadge();
});

/* ───────── 模式切换：文生图 / 改图 ───────── */
function setMode(m) {
  mode = m;
  document.querySelectorAll("#modeSeg .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
  $("editZone").hidden = m !== "edit";
  $("reqInput").placeholder = m === "edit"
    ? "描述你想怎么改这张图，例如：把背景换成纯白棚拍，保留主体不变……"
    : "用一句话描述你想要的画面，例如：一张科技感的产品落地页 Banner 主视觉……";
  renderTemplates();
}
document.querySelectorAll("#modeSeg .seg-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

/* ───────── 提示词模板 ───────── */
function renderTemplates() {
  const list = mode === "edit" ? EDIT_TEMPLATES : TEMPLATES;
  const wrap = $("templateChips");
  wrap.innerHTML = "";
  list.forEach(t => {
    const c = document.createElement("button");
    c.type = "button"; c.className = "chip"; c.textContent = t.label; c.title = t.text;
    c.addEventListener("click", () => { $("reqInput").value = t.text; $("reqInput").focus(); });
    wrap.appendChild(c);
  });
}

/* ───────── 改图：上传参考图 ───────── */
let dropUrls = [];   // 当前预览用的 blob URL，重建前统一回收，避免内存泄漏
function refreshDropPreview() {
  const prev = $("dropPreview");
  dropUrls.forEach(u => URL.revokeObjectURL(u));
  dropUrls = [];
  prev.innerHTML = "";
  editFiles.forEach((f, i) => {
    const url = URL.createObjectURL(f);
    dropUrls.push(url);
    const item = document.createElement("div");
    item.className = "drop-item";
    item.innerHTML = `<img src="${url}" alt="参考图 ${i + 1}"><button type="button" class="drop-x" title="移除">✕</button>`;
    item.querySelector(".drop-x").addEventListener("click", () => { editFiles.splice(i, 1); refreshDropPreview(); });
    prev.appendChild(item);
  });
  $("dropzone").classList.toggle("has-files", editFiles.length > 0);
}
function addFiles(fileList) {
  for (const f of fileList) if (f.type.startsWith("image/")) editFiles.push(f);
  refreshDropPreview();
}
$("imgFile").addEventListener("change", (e) => addFiles(e.target.files));
const dz = $("dropzone");
["dragover", "dragenter"].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove("drag")));
dz.addEventListener("drop", (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
dz.addEventListener("click", (e) => { if (!e.target.closest(".drop-item")) $("imgFile").click(); });

/* 把生成结果「以此改图」：data URL → File，切到改图模式 */
async function useAsEdit(src) {
  try {
    const blob = await (await fetch(src)).blob();
    editFiles = [new File([blob], `from-gallery-${Date.now()}.png`, { type: blob.type || "image/png" })];
    setMode("edit");
    refreshDropPreview();
    $("reqInput").focus();
    $("editZone").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch { /* ignore */ }
}

/* ───────── 本地历史（缩略图存档，避免撑爆 localStorage） ───────── */
function thumbnail(src, max = 240) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      try { resolve(cv.toDataURL("image/jpeg", 0.7)); } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
async function pushHistory({ requirement, prompt, mode: m, images }) {
  const thumb = images[0] ? await thumbnail(images[0]) : "";
  const list = store.get(KEY.history, []);
  list.unshift({ id: Date.now(), ts: new Date().toISOString(), mode: m, requirement, prompt, count: images.length, thumb });
  store.set(KEY.history, list.slice(0, 24));
  renderHistory();
}
function renderHistory() {
  const list = store.get(KEY.history, []);
  const sec = $("historySec"), grid = $("historyGrid");
  sec.hidden = list.length === 0;
  grid.innerHTML = "";
  list.forEach(item => {
    const card = document.createElement("div");
    card.className = "hist-card";
    card.title = item.prompt || item.requirement || "";
    card.innerHTML = `
      ${item.thumb ? `<img src="${item.thumb}" alt="历史缩略图">` : `<div class="hist-noimg">无预览</div>`}
      <div class="hist-meta">
        <span class="hist-tag">${item.mode === "edit" ? "改图" : "文生图"} · ${item.count} 张</span>
        <span class="hist-req">${(item.requirement || item.prompt || "").slice(0, 40)}</span>
      </div>`;
    card.addEventListener("click", () => {
      setMode(item.mode === "edit" ? "edit" : "generate");
      $("reqInput").value = item.requirement || item.prompt || "";
      $("reqInput").focus();
      $("reqInput").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    grid.appendChild(card);
  });
}
$("clearHistory").addEventListener("click", () => { store.set(KEY.history, []); renderHistory(); });

/* ───────── Lightbox ───────── */
$("lightboxClose").addEventListener("click", () => $("lightbox").hidden = true);
$("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("lightbox").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("lightbox").hidden = true; closeSettings(); } });

/* ───────── 运行工作流 ───────── */
function buildProvider() {
  const s = getSettings();
  return isLive(s) ? makeOpenAIProvider(s) : makeDemoProvider();
}
function currentOpts() {
  return {
    n: +($("countSel").value || 1),
    aspect: document.querySelector("#aspectSeg .seg-btn.active")?.dataset.aspect || "square",
    quality: $("qualitySel").value || "high",
    files: editFiles
  };
}

async function run(skipRefine) {
  if (running) return;
  const requirement = $("reqInput").value.trim();
  if (!requirement) { $("reqInput").focus(); return; }
  if (mode === "edit" && editFiles.length === 0) {
    ui = ui || createUI({ onUseAsEdit: useAsEdit });
    $("stage").hidden = false; ui.reset();
    ui.error("改图模式需要先上传至少一张参考图。");
    return;
  }

  running = true;
  setRunning(true);
  $("stage").hidden = false;
  if (!ui) ui = createUI({ onUseAsEdit: useAsEdit });
  ui.reset();

  const opts = currentOpts();
  try {
    const result = await runPipeline({
      requirement, mode, opts, skipRefine,
      provider: buildProvider(),
      handlers: {
        beginPrompt: () => ui.beginPrompt(),
        onSkipRefine: (p) => ui.noteSkip(p),
        beginImages: () => ui.beginImages(),
        onImages: ({ prompt, images, mode: m }) => ui.renderImages({ prompt, images, mode: m })
      }
    });
    if (result?.images?.length) {
      await pushHistory({ requirement, prompt: result.prompt, mode, images: result.images });
    }
  } catch (e) {
    ui.error(e.message || String(e));
    ui.error("提示：演示模式无需 Key；真实模型请检查 Base URL / Key / 模型名，以及该端点是否允许浏览器跨域(CORS)。gpt-image-1 可能需要账号完成组织验证。");
  } finally {
    running = false;
    setRunning(false);
  }
}
function setRunning(on) {
  $("runBtn").disabled = on;
  $("skipBtn").disabled = on;
  $("runBtn").textContent = on ? "运行中…" : "① 生成提示词 ▸";
}

$("runBtn").addEventListener("click", () => run(false));
$("skipBtn").addEventListener("click", () => run(true));
$("resetBtn").addEventListener("click", () => {
  if (running) return;
  ui && ui.reset();
  $("stage").hidden = true;
  $("reqInput").focus();
});
$("reqInput").addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(false); });

/* ───────── init ───────── */
initTheme();
refreshModeBadge();
renderTemplates();
renderHistory();
