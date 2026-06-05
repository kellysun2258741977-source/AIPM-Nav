// 应用入口：主题 / 设置(BYOK) / 模式判定 / 运行 Agent 并把每一步接到 UI。

import { runAgent } from "./agent.js";
import { createUI } from "./ui.js";
import { makeDemoProvider } from "./providers/demo.js";
import { makeOpenAIProvider } from "./providers/openai.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
};
const KEY = { theme: "prd.theme", settings: "prd.settings" };

const PRESETS = {
  demo:     { baseURL: "", model: "" },
  openai:   { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  custom:   { baseURL: "", model: "" }
};

let ui = null;
let running = false;

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

/* ───────── 设置 / BYOK ───────── */
function getSettings() { return store.get(KEY.settings, { preset: "demo", baseURL: "", apiKey: "", model: "" }); }

function isLive(s) { return !!(s && s.preset !== "demo" && s.apiKey && s.baseURL); }

function refreshModeBadge() {
  const s = getSettings();
  const badge = $("modeBadge");
  const hint = $("composerHint");
  if (isLive(s)) {
    badge.textContent = `真实模型 · ${s.model || "model"}`;
    badge.className = "badge badge-live";
    hint.textContent = `已接入真实模型（${s.baseURL}），由 function-calling 驱动。`;
  } else {
    badge.textContent = "演示模式";
    badge.className = "badge badge-demo";
    hint.textContent = "演示模式无需 API Key，可直接体验完整 Agent 流程。点 ⚙ 可接入你自己的模型。";
  }
}

function openSettings() {
  const s = getSettings();
  $("baseUrl").value = s.baseURL || "";
  $("apiKey").value = s.apiKey || "";
  $("modelName").value = s.model || "";
  selectPresetUI(s.preset || "demo");
  $("settingsModal").hidden = false;
}
function closeSettings() { $("settingsModal").hidden = true; }

function selectPresetUI(preset) {
  document.querySelectorAll("#presetSeg .seg-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.preset === preset));
  if (preset !== "custom" && PRESETS[preset]) {
    if (preset === "demo") { $("baseUrl").value = ""; $("modelName").value = ""; }
    else {
      $("baseUrl").value = PRESETS[preset].baseURL;
      $("modelName").value = PRESETS[preset].model;
    }
  }
}

$("settingsBtn").addEventListener("click", openSettings);
$("settingsClose").addEventListener("click", closeSettings);
$("settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettings(); });
// Esc 关闭设置弹窗（与 Image Studio 行为一致）
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("settingsModal").hidden) closeSettings(); });

document.querySelectorAll("#presetSeg .seg-btn").forEach(b =>
  b.addEventListener("click", () => selectPresetUI(b.dataset.preset)));

$("saveSettings").addEventListener("click", () => {
  const preset = document.querySelector("#presetSeg .seg-btn.active")?.dataset.preset || "demo";
  const s = {
    preset,
    baseURL: $("baseUrl").value.trim(),
    apiKey: $("apiKey").value.trim(),
    model: $("modelName").value.trim()
  };
  store.set(KEY.settings, s);
  refreshModeBadge();
  closeSettings();
});

$("clearKeyBtn").addEventListener("click", () => {
  store.set(KEY.settings, { preset: "demo", baseURL: "", apiKey: "", model: "" });
  $("baseUrl").value = ""; $("apiKey").value = ""; $("modelName").value = "";
  selectPresetUI("demo");
  refreshModeBadge();
});

/* ───────── 运行 Agent ───────── */
function buildProvider() {
  const s = getSettings();
  return isLive(s) ? makeOpenAIProvider(s) : makeDemoProvider();
}

function makeHandlers() {
  const phaseOf = { clarify_requirements: 1, draft_user_stories: 2, compose_prd: 3 };
  return {
    beginStream() { return ui.beginStream(); },
    async onAction(name, args) {
      if (phaseOf[name]) ui.setPhase(phaseOf[name]);
      ui.action(name, args);
    },
    async executeTool(name, args) {
      if (name === "clarify_requirements") {
        const answers = await ui.askClarify(args.questions || []);
        return { answers };
      }
      if (name === "draft_user_stories") {
        ui.renderStories(args.stories || []);
        return { status: "saved", count: (args.stories || []).length };
      }
      if (name === "compose_prd") {
        const { thought, ...prd } = args;
        ui.renderPRD(prd);
        return { status: "saved" };
      }
      return { status: "unknown_tool", name };
    },
    async onObservation(name, result) {
      // 用户故事 / PRD 已经以富文本形式呈现，无需重复 pill；仅澄清环节补一个观察提示。
      if (name === "clarify_requirements") ui.observation(name, result);
    },
    onDone() {
      ui.setPhase(4); // 全部置为已完成
    }
  };
}

async function run() {
  if (running) return;
  const idea = $("ideaInput").value.trim();
  if (!idea) { $("ideaInput").focus(); return; }

  running = true;
  $("runBtn").disabled = true;
  $("runBtn").textContent = "运行中…";
  $("stage").hidden = false;
  if (!ui) ui = createUI();
  ui.reset();
  ui.setPhase(1);

  try {
    await runAgent({ idea, provider: buildProvider(), handlers: makeHandlers() });
  } catch (e) {
    ui.error(e.message || String(e));
    ui.error("提示：演示模式无需 Key；若使用真实模型，请检查 Base URL / Key / 模型名，以及该端点是否允许浏览器跨域(CORS)访问。");
  } finally {
    running = false;
    $("runBtn").disabled = false;
    $("runBtn").textContent = "运行 Agent ▸";
  }
}

$("runBtn").addEventListener("click", run);
$("resetBtn").addEventListener("click", () => {
  if (running) return;
  ui && ui.reset();
  $("stage").hidden = true;
  ui && ui.setPhase(0);
  $("ideaInput").focus();
});
$("ideaInput").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
});
document.querySelectorAll("#exampleChips .chip").forEach(c =>
  c.addEventListener("click", () => { $("ideaInput").value = c.textContent; $("ideaInput").focus(); }));

/* ───────── init ───────── */
initTheme();
refreshModeBadge();
