// UI 层：把工作流的每一步画成卡片，承载流式思考、可编辑提示词、出图画廊与放大查看。
// 与 pipeline 解耦——pipeline 只调 handlers，handlers 调这里的方法。

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? "").replace(/[<&>"]/g, c => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" }[c]));

export function createUI({ onUseAsEdit } = {}) {
  const trace = document.getElementById("trace");
  const phaseEls = [...document.querySelectorAll("#phases .phase")];

  function setPhase(n) {
    phaseEls.forEach(p => {
      const k = +p.dataset.phase;
      p.classList.toggle("active", k === n);
      p.classList.toggle("done", k < n);
    });
  }

  function reset() { trace.innerHTML = ""; galleryGrid = null; setPhase(0); }

  function scrollToEnd() {
    requestAnimationFrame(() => trace.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  /* ── 工序①②：提示词扩写 + 人在环中确认 ── */
  function beginPrompt() {
    setPhase(1);
    const step = el("div", "step think");
    step.innerHTML = `
      <div class="step-head">
        <span class="step-ico">💭</span>
        <span class="step-tag">需求理解 · 撰写图像提示词</span>
      </div>
      <div class="step-body"><span class="thinking caret"></span></div>`;
    trace.appendChild(step);
    scrollToEnd();
    const body = step.querySelector(".thinking");

    return {
      push(t) { body.classList.remove("caret"); body.textContent += t; body.classList.add("caret"); scrollToEnd(); },
      cancel() { step.remove(); },
      finalize(data) {
        body.classList.remove("caret");
        body.textContent = data.thought || "已生成图像提示词。";
        // 在同一张卡里追加可编辑的提示词区
        const box = el("div", "prompt-box");
        const tips = (data.tips || []).map(t => `<button type="button" class="chip tip-chip">${esc(t)}</button>`).join("");
        box.innerHTML = `
          <label class="mini-label">图像提示词（可编辑后再出图）</label>
          <textarea class="prompt-area" rows="5">${esc(data.prompt)}</textarea>
          ${data.prompt_zh ? `<p class="prompt-zh">中文要点：${esc(data.prompt_zh)}</p>` : ""}
          ${tips ? `<div class="chips tip-row"><span class="tip-hint">微调建议：</span>${tips}</div>` : ""}
          <div class="prompt-foot">
            <button type="button" class="text-btn cancel-btn">取消</button>
            <button type="button" class="run-btn gen-btn">用此提示词生图 ▸</button>
          </div>`;
        step.appendChild(box);
        scrollToEnd();

        const area = box.querySelector(".prompt-area");
        // 微调建议点一下追加到提示词尾部
        box.querySelectorAll(".tip-chip").forEach(c =>
          c.addEventListener("click", () => { area.value += (area.value.trim() ? ", " : "") + c.textContent; area.focus(); }));

        return new Promise(resolve => {
          const finish = (val) => {
            box.querySelector(".prompt-foot").remove();
            box.querySelectorAll(".tip-chip").forEach(c => c.disabled = true);
            area.readOnly = true;
            resolve(val);
          };
          box.querySelector(".gen-btn").addEventListener("click", () => {
            const v = area.value.trim();
            if (!v) { area.focus(); return; }
            finish(v);
          });
          box.querySelector(".cancel-btn").addEventListener("click", () => finish(null));
        });
      }
    };
  }

  /* 跳过扩写时，补一张说明卡 */
  function noteSkip(prompt) {
    const step = el("div", "step observe");
    step.innerHTML = `
      <div class="step-head"><span class="step-ico">⏭</span><span class="step-tag">跳过扩写 · 直接出图</span></div>
      <div class="step-body"><code class="inline-prompt">${esc(prompt)}</code></div>`;
    trace.appendChild(step); scrollToEnd();
  }

  /* ── 工序③：出图画廊 ── */
  let galleryGrid = null;
  function beginImages() {
    setPhase(2);
    const step = el("div", "step act");
    step.innerHTML = `
      <div class="step-head"><span class="step-ico">🎨</span><span class="step-tag">出图中…</span></div>
      <div class="gallery loading">
        <div class="spinner"></div><span class="loading-txt">正在生成，请稍候（图像生成通常需要数秒到数十秒）…</span>
      </div>`;
    trace.appendChild(step); scrollToEnd();
    step._head = step.querySelector(".step-tag");
    step._gal = step.querySelector(".gallery");
    galleryGrid = step;
  }

  function renderImages({ prompt, images, mode }) {
    const step = galleryGrid;
    if (!step) return;
    step._head.textContent = `已出图 · ${images.length} 张`;
    step.classList.remove("act"); step.classList.add("answer");
    const gal = step._gal;
    gal.classList.remove("loading");
    gal.innerHTML = "";
    if (!images.length) {
      gal.innerHTML = `<p class="err">没有返回图片。请检查模型与参数，或稍后重试。</p>`;
      return;
    }
    images.forEach((src, i) => {
      const card = el("div", "img-card");
      card.innerHTML = `
        <button type="button" class="img-thumb" title="点击放大"><img alt="生成结果 ${i + 1}" loading="lazy" src="${src}"></button>
        <div class="img-actions">
          <button type="button" class="mini-btn act-zoom">放大</button>
          <button type="button" class="mini-btn act-dl">下载</button>
          <button type="button" class="mini-btn act-edit">以此改图</button>
        </div>`;
      card.querySelector(".img-thumb").addEventListener("click", () => openLightbox(src));
      card.querySelector(".act-zoom").addEventListener("click", () => openLightbox(src));
      card.querySelector(".act-dl").addEventListener("click", () => download(src, i));
      card.querySelector(".act-edit").addEventListener("click", () => onUseAsEdit && onUseAsEdit(src));
      gal.appendChild(card);
    });
    setPhase(3);
    scrollToEnd();
    galleryGrid = null; // 本轮出图完成，避免后续错误卡误判
  }

  function error(msg) {
    if (galleryGrid) { // 出图阶段失败：把 loading 卡变成错误
      galleryGrid._head.textContent = "出图失败";
      galleryGrid._gal.classList.remove("loading");
      galleryGrid._gal.innerHTML = `<p class="err">${esc(msg)}</p>`;
      galleryGrid = null;
      return;
    }
    trace.appendChild(el("div", "step", `<p class="err">${esc(msg)}</p>`));
    scrollToEnd();
  }

  /* ── Lightbox ── */
  function openLightbox(src) {
    const mask = document.getElementById("lightbox");
    document.getElementById("lightboxImg").src = src;
    mask.hidden = false;
  }

  /* ── 下载 ── */
  function download(src, i) {
    const a = document.createElement("a");
    const ext = src.startsWith("data:image/svg") ? "svg" : "png";
    a.href = src;
    a.download = `image-studio-${Date.now()}-${i + 1}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return { reset, setPhase, beginPrompt, noteSkip, beginImages, renderImages, error, openLightbox };
}
