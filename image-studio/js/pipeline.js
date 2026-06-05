// 工作流编排 —— 与具体 provider、UI 解耦。两道工序，中间有一个「人在环中」的确认点：
//   ① 需求 → 图像提示词（文本模型扩写，逐字流式）
//   ② 人审阅/微调提示词后确认  ←─ human-in-the-loop
//   ③ 提示词 → 出图 N 张（图像模型）
//
// 第 ② 步刻意把控制权交回给人：出图前能看清、能改提示词，这正是「工作流」相对「黑盒一键生成」的价值。

export async function runPipeline({ requirement, mode, opts, provider, handlers, skipRefine = false }) {
  let finalPrompt;

  if (skipRefine) {
    // 直接拿原始需求当提示词出图（跳过文本模型）
    finalPrompt = requirement;
    handlers.onSkipRefine && handlers.onSkipRefine(requirement);
  } else {
    // 工序①：扩写提示词
    const live = handlers.beginPrompt();
    let data;
    try {
      data = await provider.writePrompt({ requirement, mode, onToken: t => live.push(t) });
    } catch (e) {
      live.cancel();
      throw e;
    }
    // 工序②：渲染可编辑提示词，等待人确认（resolve 最终提示词；取消则 resolve null）
    finalPrompt = await live.finalize(data);
    if (!finalPrompt) return null;
  }

  // 工序③：出图
  handlers.beginImages();
  const images = mode === "edit"
    ? await provider.edit({ prompt: finalPrompt, images: opts.files, n: opts.n, aspect: opts.aspect, quality: opts.quality })
    : await provider.generate({ prompt: finalPrompt, n: opts.n, aspect: opts.aspect, quality: opts.quality });

  handlers.onImages({ prompt: finalPrompt, images, mode, opts });
  return { prompt: finalPrompt, images };
}
