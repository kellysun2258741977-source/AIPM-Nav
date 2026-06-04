// 演示模式提供方：零配置、无需 API Key。
// 它并不调用任何大模型，而是用一套脚本化、模板化的逻辑「扮演」一个会 function-calling 的模型，
// 让作品集在没有 Key 的环境下也能完整跑通 Agent 的「思考 → 调用工具 → 观察 → 回答」循环。
//
// 接口与真实模型完全一致：chat({ messages, tools }) → 返回一条 assistant 消息
// （可能带 tool_calls）。Agent 编排层对两种 provider 一视同仁。

let __id = 0;
const newId = () => `call_demo_${Date.now()}_${++__id}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 把一段文本切成小块，通过 onToken 模拟真实模型的 token 流，
// 让演示模式与真实模式共用同一套「逐字呈现」的 UI。
async function emit(content, onToken) {
  if (!onToken || !content) return;
  const chunks = content.match(/[^]{1,2}/gu) || [content];
  for (const c of chunks) { onToken(c); await sleep(16); }
}

// 从想法里提取一个像样的标题（去掉常见前缀，截断）。
function deriveTitle(idea) {
  let t = (idea || "").trim();
  // 去掉「帮/给 + 对象 + 做/开发」这类前缀，尽量留下产品本体
  t = t.replace(/^(帮|给)[^，,。.]{0,12}?(做|开发|搭建|设计|弄)一?(个|款|套)?/, "");
  t = t.replace(/^(做|做一个|开发|搭建|想做|我想做|设计)一?(个|款|套)?/, "");
  t = t.replace(/[。.!！]+$/, "").trim();
  if (!t) t = "新产品";
  if (t.length > 22) t = t.slice(0, 22) + "…";
  return t;
}

// 极轻量的领域猜测，仅用于让示例答案更贴题（非必须）。
function guessDomain(idea) {
  const s = idea || "";
  const has = (...ks) => ks.some(k => s.includes(k));
  if (has("考研", "学习", "错题", "背单词", "课程", "学生")) return "education";
  if (has("宠物", "猫", "狗", "健康", "健身", "运动")) return "health";
  if (has("订阅", "收入", "营收", "财务", "记账", "看板", "SaaS", "saas")) return "saas";
  if (has("OKR", "团队", "协作", "项目", "任务")) return "team";
  if (has("电商", "商城", "购物", "下单", "卖")) return "commerce";
  return "generic";
}

const SAMPLE_ANSWERS = {
  education: {
    target_user: "备考阶段、自律但缺方法的大学生",
    core_problem: "错题分散在纸质本和各类 App，难以复盘高频考点",
    success_metric: "周活跃留存 ≥ 35%，人均每周复习错题 ≥ 20 道",
    mvp_scope: "拍照/导入错题并自动按知识点归类"
  },
  health: {
    target_user: "养宠 1~3 年、关注科学喂养的年轻主人",
    core_problem: "疫苗、驱虫、体检等健康事项分散，容易漏记漏做",
    success_metric: "次月留存 ≥ 40%，提醒按时完成率 ≥ 70%",
    mvp_scope: "健康事项提醒与一键记录"
  },
  saas: {
    target_user: "做订阅制产品的独立开发者 / 小团队",
    core_problem: "MRR、流失、续费分散在 Stripe 后台，缺乏经营视角",
    success_metric: "付费转化 ≥ 5%，周活跃 ≥ 50%",
    mvp_scope: "对接收款数据，自动算出 MRR 与流失看板"
  },
  team: {
    target_user: "10~30 人、希望对齐目标的初创团队",
    core_problem: "OKR 写在文档里无人维护，进度不透明",
    success_metric: "团队周更新率 ≥ 80%，季度留存 ≥ 60%",
    mvp_scope: "目标录入 + 进度周更 + 看板视图"
  },
  commerce: {
    target_user: "想轻量起步的个体商家",
    core_problem: "建店门槛高、链路重，难以快速验证选品",
    success_metric: "开店转化 ≥ 20%，首单 7 日转化 ≥ 8%",
    mvp_scope: "三步建店并生成可分享的下单页"
  },
  generic: {
    target_user: "对该问题有明确痛感的早期核心用户",
    core_problem: "现有方案要么太重、要么零散，缺少顺手的工具",
    success_metric: "次月留存 ≥ 30%，核心动作周频次 ≥ 3 次",
    mvp_scope: "围绕核心动作打磨一条顺滑的主流程"
  }
};

// 工具调用包装
function toolCall(name, args) {
  return {
    id: newId(),
    type: "function",
    function: { name, arguments: JSON.stringify(args) }
  };
}

// 扫描历史，判断已经走到哪一步 + 取出 idea 与各轮澄清答案（支持多轮）。
function readState(messages) {
  const idea = (messages.find(m => m.role === "user")?.content || "").replace(/^产品想法：/, "");
  let clarifyCount = 0, storiesDone = false, prdDone = false;
  const rounds = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls) {
      m.tool_calls.forEach(tc => {
        if (tc.function.name === "clarify_requirements") clarifyCount++;
        if (tc.function.name === "draft_user_stories") storiesDone = true;
        if (tc.function.name === "compose_prd") prdDone = true;
      });
    }
    if (m.role === "tool" && m.name === "clarify_requirements") {
      try { rounds.push(JSON.parse(m.content).answers || {}); } catch { /* ignore */ }
    }
  }
  // 后一轮答案覆盖前一轮（追问用于精化）
  const answers = Object.assign({}, ...rounds);
  return { idea, clarifyCount, storiesDone, prdDone, answers };
}

const hasNumber = (s) => /[0-9０-９%％]/.test(s || "");

// 判断是否值得再追问一轮：指标没量化，或目标用户过于笼统。
function needFollowUp(ans) {
  return !hasNumber(ans.success_metric) || (ans.target_user || "").trim().length < 5;
}

// 针对性的追问（最多两题），体现 PM「把指标钉成可量化目标」的习惯。
function buildFollowUp(ans) {
  const qs = [];
  if (!hasNumber(ans.success_metric)) {
    qs.push({
      id: "success_metric",
      question: `你用「${ans.success_metric || "成功指标"}」判断成功——能再钉成一个量化目标吗？给个数字或区间。`,
      why: "没有量化的指标无法指导功能取舍与优先级。",
      options: ["次月留存 ≥ 30%", "周活跃用户 ≥ 50%", "付费转化 ≥ 5%"]
    });
  }
  if ((ans.target_user || "").trim().length < 5) {
    qs.push({
      id: "target_user",
      question: "再把目标用户说具体些：他们在什么场景、有什么特征？",
      why: "用户画像越具体，后续需求取舍越有依据。",
      options: ["先聚焦一类高频重度用户", "覆盖尽量广的大众用户", "B 端团队 / 企业"]
    });
  }
  if (qs.length === 0) {
    qs.push({ id: "extra", question: "还有什么关键约束需要我知道的吗？", why: "查漏补缺。", options: ["暂时没有了"] });
  }
  return qs;
}

function buildQuestions() {
  return [
    {
      id: "target_user",
      question: "这个产品最核心的目标用户是谁？请尽量具体到「在什么场景下、有什么特征」。",
      why: "用户画像越具体，需求取舍越有依据。",
      options: ["先聚焦一类高频重度用户", "覆盖尽量广的大众用户", "B 端团队 / 企业"]
    },
    {
      id: "core_problem",
      question: "他们当前最痛的那个问题或场景是什么？现在是怎么凑合解决的？",
      why: "找准「最痛的一刀」，决定 v1 该先做什么。",
      options: ["流程繁琐、效率低", "信息分散、难以掌控", "缺乏专业指导"]
    },
    {
      id: "success_metric",
      question: "上线后，你会用什么指标判断它成功了？",
      why: "好的指标能反向约束功能设计与优先级。",
      options: ["留存率", "核心动作频次", "付费转化"]
    },
    {
      id: "mvp_scope",
      question: "如果 v1 只能做一件最关键的事，你希望是什么？",
      why: "明确 MVP 边界，避免一上来就铺太宽。",
      options: ["打磨核心主流程", "先做数据/内容沉淀", "先验证付费意愿"]
    }
  ];
}

function buildStories(idea, ans) {
  const u = ans.target_user || "目标用户";
  const scope = ans.mvp_scope || "核心功能";
  return [
    {
      role: u,
      capability: `用一条顺滑的主流程完成「${scope}」`,
      benefit: "第一次使用就能拿到明确结果，愿意留下来",
      priority: "P0",
      acceptance_criteria: [
        "新用户可在 3 步内完成一次完整的核心动作",
        "完成后能看到可感知的即时反馈或结果",
        "中途退出可恢复，不丢失已填内容"
      ]
    },
    {
      role: u,
      capability: "随时回看与管理自己沉淀的数据",
      benefit: "让使用价值随时间累积，形成回访理由",
      priority: "P0",
      acceptance_criteria: [
        "历史记录按时间/分类可检索",
        "支持编辑与删除，操作可撤销"
      ]
    },
    {
      role: u,
      capability: "在合适的时机收到有用的提醒/建议",
      benefit: "把「想起来用」变成「被自然带回来」",
      priority: "P1",
      acceptance_criteria: [
        "用户可自定义提醒的开关与频率",
        "提醒内容与其真实数据相关，而非通用文案"
      ]
    },
    {
      role: "产品/运营",
      capability: "看到关键指标的实时数据",
      benefit: `验证「${ans.success_metric || "成功指标"}」是否达成`,
      priority: "P1",
      acceptance_criteria: [
        "核心漏斗各环节转化率可见",
        "可按日期范围筛选"
      ]
    },
    {
      role: u,
      capability: "把成果一键导出或分享给他人",
      benefit: "借助分享获得自传播与外部认可",
      priority: "P2",
      acceptance_criteria: [
        "可生成只读分享链接或导出文件",
        "分享内容不泄露敏感信息"
      ]
    }
  ];
}

function buildPrd(idea, ans) {
  const title = deriveTitle(idea);
  return {
    title,
    one_liner: `面向「${ans.target_user || "核心用户"}」，用最短路径解决「${ans.core_problem || "其核心痛点"}」的工具。`,
    background: `用户群体「${ans.target_user || "核心用户"}」在日常中面临的核心问题是：${ans.core_problem || "现有方案零散、不够顺手"}。现有替代方案要么过重、要么需要在多个工具间来回切换，缺少一个围绕该场景打磨的、低门槛的解决方案。本产品聚焦于「${ans.mvp_scope || "核心主流程"}」，先把最痛的一刀做透，再逐步扩展。`,
    goals: [
      `让目标用户能顺畅完成「${ans.mvp_scope || "核心动作"}」并获得即时价值`,
      `通过数据沉淀与适时提醒，建立稳定的回访理由`,
      `达成北极星指标：${ans.success_metric || "次月留存与核心动作频次"}`
    ],
    non_goals: [
      "v1 不做复杂的多人协作与权限体系",
      "v1 不追求全平台覆盖，先打磨单一主端体验",
      "暂不引入重度的个性化推荐算法"
    ],
    target_users: [
      { persona: "核心用户", description: ans.target_user || "对该问题有明确痛感、愿意尝试新工具的早期用户" },
      { persona: "扩展用户", description: "被核心用户带动、有相似但更轻量需求的人群" }
    ],
    features: [
      { name: "核心主流程", description: `围绕「${ans.mvp_scope || "核心动作"}」打磨 3 步内可完成的顺滑流程，是产品的价值锚点。`, priority: "P0" },
      { name: "数据沉淀与管理", description: "记录、检索、编辑用户产生的数据，让价值随时间累积。", priority: "P0" },
      { name: "智能提醒/建议", description: "基于用户真实数据，在合适时机推送相关提醒，提升回访。", priority: "P1" },
      { name: "指标看板", description: "面向产品方，呈现核心漏斗与北极星指标，支撑迭代决策。", priority: "P1" },
      { name: "导出与分享", description: "一键导出/分享成果，撬动自传播。", priority: "P2" }
    ],
    metrics: [
      { name: "北极星指标", target: ans.success_metric || "次月留存 ≥ 30%" },
      { name: "激活率", target: "新用户当日完成一次核心动作 ≥ 50%" },
      { name: "核心动作频次", target: "活跃用户每周 ≥ 3 次" },
      { name: "次月留存", target: "≥ 30%" }
    ],
    risks: [
      { risk: "核心流程价值不够强，用户用一次即流失", mitigation: "先做小范围用户访谈与可用性测试，验证「最痛一刀」后再扩展。" },
      { risk: "提醒过度打扰，引发卸载", mitigation: "默认克制，提供清晰的频率控制与一键关闭。" },
      { risk: "冷启动缺少数据，看板与建议价值有限", mitigation: "v1 聚焦单机/个人价值闭环，降低对规模的依赖。" }
    ]
  };
}

// 组装一条 assistant 消息，并按需把 content 以模拟 token 流推送出去。
async function reply(content, tool_calls, onToken) {
  await emit(content, onToken);
  return { role: "assistant", content, tool_calls: tool_calls || [] };
}

export function makeDemoProvider() {
  return {
    name: "demo",
    async chat({ messages, onToken }) {
      const st = readState(messages);
      const ans = st.answers || {};

      // 第 1 步：首轮澄清
      if (st.clarifyCount === 0) {
        return reply(
          `用户给的想法还比较粗略（「${deriveTitle(st.idea)}」）。动手写需求前，我先锁定三个最关键的不确定点：目标用户、核心问题、成功指标，再补一个 MVP 范围问题。我来发起澄清。`,
          [toolCall("clarify_requirements", {
            thought: "先澄清目标用户 / 核心问题 / 成功指标 / MVP 范围这四个关键点。",
            questions: buildQuestions()
          })],
          onToken
        );
      }

      // 第 1.5 步：必要时追问一轮（最多两轮）
      if (st.clarifyCount === 1 && needFollowUp(ans)) {
        const reason = !hasNumber(ans.success_metric)
          ? `成功指标「${ans.success_metric || "（未填）"}」还不够量化`
          : "目标用户画像还比较笼统";
        return reply(
          `用户的回答里，${reason}——这会让后面的功能取舍失去抓手。我再追问一轮，把它钉成可衡量/更具体的输入，再进入用户故事。`,
          [toolCall("clarify_requirements", {
            thought: "对含糊的关键信息做针对性追问（量化指标 / 细化用户），避免带着模糊前提往下走。",
            questions: buildFollowUp(ans)
          })],
          onToken
        );
      }

      // 第 2 步：用户故事
      if (!st.storiesDone) {
        return reply(
          `澄清完成：目标用户「${ans.target_user || "（待补充）"}」，最痛的问题「${ans.core_problem || "（待补充）"}」，成功指标「${ans.success_metric || "（待补充）"}」。据此我把需求拆成带验收标准的用户故事，并按对北极星指标的贡献排优先级——核心主流程和数据沉淀定为 P0。`,
          [toolCall("draft_user_stories", {
            thought: "围绕核心动作拆故事，P0 聚焦激活与留存，P1/P2 服务增长与传播。",
            stories: buildStories(st.idea, ans)
          })],
          onToken
        );
      }

      // 第 3 步：PRD
      if (!st.prdDone) {
        return reply(
          "用户故事已就绪。最后我把背景、目标与非目标、用户画像、功能点、指标和风险整合成一份完整 PRD —— 特别用「非目标」明确 v1 边界，避免范围蔓延。",
          [toolCall("compose_prd", {
            thought: "把前两步的产出收敛成一份可直接评审的 PRD，并显式划定边界。",
            ...buildPrd(st.idea, ans)
          })],
          onToken
        );
      }

      // 收尾（最终交付，无工具调用）
      return reply(
        "PRD 草稿已生成 ✅ 你可以在上方复制为 Markdown 或下载。这只是 v1 草稿——建议接下来拿它去和 3~5 位真实目标用户验证「最痛的一刀」，再据反馈迭代功能优先级。",
        [],
        onToken
      );
    }
  };
}
