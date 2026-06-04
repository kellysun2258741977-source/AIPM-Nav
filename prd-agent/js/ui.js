// UI 渲染层：把 Agent 的每一步「可见化」，并提供澄清交互、用户故事、PRD 文档渲染与导出。

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STEP_META = {
  think:   { tag: "思考 · THINK",   ico: "💭" },
  act:     { tag: "行动 · ACT",     ico: "🔧" },
  observe: { tag: "观察 · OBSERVE", ico: "👁" },
  answer:  { tag: "交付 · ANSWER",  ico: "✓" }
};

const TOOL_LABEL = {
  clarify_requirements: "clarify_requirements",
  draft_user_stories: "draft_user_stories",
  compose_prd: "compose_prd"
};

export function createUI() {
  const trace = $("trace");
  let lastPrd = null;

  function scrollToEnd() {
    requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  }

  function makeStep(kind) {
    const meta = STEP_META[kind];
    const step = el("div", `step ${kind}`);
    const head = el("div", "step-head");
    head.append(el("span", "step-ico", meta.ico), el("span", "step-tag", meta.tag));
    const body = el("div", "step-body");
    step.append(head, body);
    trace.append(step);
    scrollToEnd();
    return { step, body };
  }

  return {
    reset() {
      trace.innerHTML = "";
      lastPrd = null;
    },

    setPhase(n) {
      document.querySelectorAll(".phase").forEach(p => {
        const i = Number(p.dataset.phase);
        p.classList.toggle("active", i === n);
        p.classList.toggle("done", i < n);
      });
    },

    // 开一个流式步骤：token 逐字进入，结束时再根据是否调用工具定型为「思考」或「交付」。
    beginStream() {
      const step = el("div", "step think");
      const head = el("div", "step-head");
      const ico = el("span", "step-ico", STEP_META.think.ico);
      const tag = el("span", "step-tag", STEP_META.think.tag);
      head.append(ico, tag);
      const body = el("div", "step-body caret");
      step.append(head, body);
      trace.append(step);
      scrollToEnd();

      let text = "";
      return {
        push(t) { text += t; body.textContent = text; scrollToEnd(); },
        finalize(kind) {
          body.classList.remove("caret");
          if (!text.trim()) { step.remove(); return; } // 模型直接调工具、没有前言
          const meta = STEP_META[kind] || STEP_META.think;
          step.className = `step ${kind}`;
          ico.textContent = meta.ico;
          tag.textContent = meta.tag;
        },
        cancel() { step.remove(); }
      };
    },

    action(name, args) {
      const { body } = makeStep("act");
      const wrap = el("div", "toolcall");
      wrap.append(el("div", "toolcall-name", `→ ${esc(TOOL_LABEL[name] || name)}()`));
      // 折叠参数，保持轨迹整洁，同时保留「结构化调用」的可见性
      const det = el("details");
      det.append(el("summary", null, '<span class="step-tag" style="cursor:pointer">查看调用参数 JSON</span>'));
      det.append(el("pre", "code", esc(JSON.stringify(args, null, 2))));
      wrap.append(det);
      body.append(wrap);
      scrollToEnd();
    },

    observation(name, result) {
      const { body } = makeStep("observe");
      let txt = "工具执行完成";
      if (name === "clarify_requirements") txt = `已收到用户的 ${Object.keys(result.answers || {}).length} 项澄清答案，回填进上下文`;
      else if (name === "draft_user_stories") txt = `已写入 ${result.count ?? ""} 条用户故事与验收标准`;
      else if (name === "compose_prd") txt = "PRD 各模块已组装完成";
      body.append(el("span", "obs-pill", `↩ ${esc(txt)}`));
      scrollToEnd();
    },

    error(msg) {
      trace.append(el("div", "err", `⚠ ${esc(msg)}`));
      scrollToEnd();
    },

    // ── 澄清问题：渲染交互卡片并等待用户作答（Promise）──
    askClarify(questions) {
      const step = el("div", "step act");
      const head = el("div", "step-head");
      head.append(el("span", "step-ico", "✋"), el("span", "step-tag", "需要你的输入 · CLARIFY"));
      const body = el("div", "step-body");
      const qcard = el("div", "qcard");
      const state = {};

      questions.forEach(q => {
        state[q.id] = "";
        const qd = el("div", "q");
        qd.append(el("div", "q-text", esc(q.question)));
        if (q.why) qd.append(el("div", "q-why", `为什么问：${esc(q.why)}`));

        const input = el("input", "q-input");
        input.type = "text";
        input.placeholder = "输入你的回答…";
        input.addEventListener("input", () => { state[q.id] = input.value; });

        if (q.options && q.options.length) {
          const opts = el("div", "q-options");
          q.options.forEach(o => {
            const b = el("button", "q-opt", esc(o));
            b.type = "button";
            b.addEventListener("click", () => {
              const on = b.classList.toggle("picked");
              opts.querySelectorAll(".q-opt").forEach(x => { if (x !== b) x.classList.remove("picked"); });
              input.value = on ? o : "";
              state[q.id] = input.value;
            });
            opts.append(b);
          });
          qd.append(opts);
        }
        qd.append(input);
        qcard.append(qd);
      });

      body.append(qcard);
      step.append(head, body);
      trace.append(step);
      scrollToEnd();

      return new Promise(resolve => {
        const foot = el("div", "qcard-foot");
        const submit = el("button", "run-btn", "提交答案 ▸");
        const fill = el("button", "text-btn", "用示例答案一键填充");

        const finish = (answers) => {
          // 锁定交互
          qcard.querySelectorAll("input,button").forEach(x => x.disabled = true);
          submit.disabled = true; fill.disabled = true;
          foot.remove();
          resolve(answers);
        };

        fill.addEventListener("click", () => {
          // 用每题的第一个选项 / 占位作为示例答案，方便无 Key 演示一键跑通
          questions.forEach(q => {
            const v = (q.options && q.options[0]) || "（示例）已确认";
            state[q.id] = v;
            const qInputs = body.querySelectorAll(".q-input");
            qInputs.forEach((inp, i) => { if (questions[i].id === q.id) inp.value = v; });
          });
          finish({ ...state });
        });

        submit.addEventListener("click", () => {
          const answers = {};
          questions.forEach(q => { answers[q.id] = (state[q.id] || "").trim(); });
          finish(answers);
        });

        foot.append(submit, fill);
        body.append(foot);
        scrollToEnd();
      });
    },

    // ── 用户故事 ──
    renderStories(stories) {
      const { body } = makeStep("observe");
      const wrap = el("div", "stories");
      stories.forEach(s => {
        const card = el("div", "story");
        const head = el("div", "story-head");
        head.append(
          el("div", "story-line", `作为 <b>${esc(s.role)}</b>，我希望 <b>${esc(s.capability)}</b>，以便 ${esc(s.benefit)}。`),
          el("span", `prio ${esc(s.priority)}`, esc(s.priority))
        );
        card.append(head);
        const ac = el("div", "ac");
        ac.append(el("div", "ac-label", "验收标准"));
        const ul = el("ul", "ac-list");
        (s.acceptance_criteria || []).forEach(c => ul.append(el("li", null, esc(c))));
        ac.append(ul);
        card.append(ac);
        wrap.append(card);
      });
      // 替换 observe 默认头为「产出」语义
      body.parentElement.querySelector(".step-tag").textContent = "产出 · USER STORIES";
      body.parentElement.querySelector(".step-ico").textContent = "📝";
      body.append(wrap);
      scrollToEnd();
    },

    // ── PRD 文档 ──
    renderPRD(prd) {
      lastPrd = prd;
      const { body } = makeStep("answer");
      body.parentElement.querySelector(".step-tag").textContent = "产出 · PRD 草稿";
      body.parentElement.querySelector(".step-ico").textContent = "📄";

      const doc = el("div", "prd");
      const bar = el("div", "prd-bar");
      bar.append(el("span", "prd-bar-title", "Product Requirements Document"));
      const actions = el("div", "prd-bar-actions");
      const copyBtn = el("button", "mini-btn", "复制 Markdown");
      const dlBtn = el("button", "mini-btn", "下载 .md");
      actions.append(copyBtn, dlBtn);
      bar.append(actions);

      const md = toMarkdown(prd);
      copyBtn.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(md); copyBtn.textContent = "已复制 ✓"; }
        catch { copyBtn.textContent = "复制失败"; }
        setTimeout(() => (copyBtn.textContent = "复制 Markdown"), 1600);
      });
      dlBtn.addEventListener("click", () => {
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const a = el("a");
        a.href = URL.createObjectURL(blob);
        a.download = `PRD-${(prd.title || "draft").replace(/\s+/g, "-")}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
      });

      doc.append(bar, el("div", "prd-doc", renderPRDInner(prd)));
      body.append(doc);
      scrollToEnd();
    },

    getMarkdown() { return lastPrd ? toMarkdown(lastPrd) : ""; }
  };
}

// ── PRD → HTML ──
function renderPRDInner(p) {
  const sec = (title, inner) => `<div class="prd-sec"><h3>${esc(title)}</h3>${inner}</div>`;
  const ul = (arr) => `<ul>${(arr || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;

  let html = `<h2>${esc(p.title || "未命名产品")}</h2>`;
  if (p.one_liner) html += `<p class="prd-meta">${esc(p.one_liner)}</p>`;

  if (p.background) html += sec("背景与问题", `<p>${esc(p.background)}</p>`);
  if (p.goals) html += sec("产品目标", ul(p.goals));
  if (p.non_goals && p.non_goals.length) html += sec("非目标（v1 不做）", ul(p.non_goals));

  if (p.target_users && p.target_users.length) {
    const rows = p.target_users.map(u =>
      `<div class="k">${esc(u.persona)}</div><div>${esc(u.description)}</div>`).join("");
    html += sec("目标用户", `<div class="kv">${rows}</div>`);
  }

  if (p.features && p.features.length) {
    const rows = p.features.map(f =>
      `<tr><td><b>${esc(f.name)}</b></td><td>${esc(f.description)}</td><td>${esc(f.priority)}</td></tr>`).join("");
    html += sec("核心功能点", `<table class="tbl"><thead><tr><th>功能</th><th>说明</th><th>优先级</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (p.metrics && p.metrics.length) {
    const rows = p.metrics.map(m => `<div class="k">${esc(m.name)}</div><div>${esc(m.target)}</div>`).join("");
    html += sec("成功指标", `<div class="kv">${rows}</div>`);
  }

  if (p.risks && p.risks.length) {
    const rows = p.risks.map(r =>
      `<tr><td>${esc(r.risk)}</td><td>${esc(r.mitigation)}</td></tr>`).join("");
    html += sec("风险与应对", `<table class="tbl"><thead><tr><th>风险</th><th>应对</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
  return html;
}

// ── PRD → Markdown ──
export function toMarkdown(p) {
  const L = [];
  L.push(`# ${p.title || "PRD 草稿"}`);
  if (p.one_liner) L.push(`> ${p.one_liner}`);
  L.push("");
  if (p.background) { L.push("## 背景与问题", "", p.background, ""); }
  if (p.goals) { L.push("## 产品目标", "", ...p.goals.map(g => `- ${g}`), ""); }
  if (p.non_goals?.length) { L.push("## 非目标（v1 不做）", "", ...p.non_goals.map(g => `- ${g}`), ""); }
  if (p.target_users?.length) {
    L.push("## 目标用户", "");
    p.target_users.forEach(u => L.push(`- **${u.persona}**：${u.description}`));
    L.push("");
  }
  if (p.features?.length) {
    L.push("## 核心功能点", "", "| 功能 | 说明 | 优先级 |", "| --- | --- | --- |");
    p.features.forEach(f => L.push(`| ${f.name} | ${f.description} | ${f.priority} |`));
    L.push("");
  }
  if (p.metrics?.length) {
    L.push("## 成功指标", "", "| 指标 | 目标 |", "| --- | --- |");
    p.metrics.forEach(m => L.push(`| ${m.name} | ${m.target} |`));
    L.push("");
  }
  if (p.risks?.length) {
    L.push("## 风险与应对", "", "| 风险 | 应对 |", "| --- | --- |");
    p.risks.forEach(r => L.push(`| ${r.risk} | ${r.mitigation} |`));
    L.push("");
  }
  L.push("---", "_由 PRD Agent 生成的草稿，建议结合真实用户验证后迭代。_");
  return L.join("\n");
}
