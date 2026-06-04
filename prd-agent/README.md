# PRD Agent · 需求/PRD 助手 Agent

> 输入一句粗略的产品想法，看一个 Agent 走完 **澄清需求 → 用户故事 → PRD 草稿** 的可见循环。
> 一个面向 **AI 产品经理（AIPM）岗位** 的作品集 Demo —— 既展示对 Agent 工作机制的理解，也展示把模糊想法收敛成可执行需求文档的产品功底。

![mode: demo + BYOK](https://img.shields.io/badge/mode-Demo%20%2B%20BYOK-9a3b2e) ![no build](https://img.shields.io/badge/build-none%20·%20pure%20web-555) ![protocol: OpenAI compatible](https://img.shields.io/badge/LLM-OpenAI%20compatible-3f6b4a)

---

## ✨ 它解决什么问题

产品经理日常最高频、也最容易做得潦草的一步，是把「我想做个 X」变成一份**结构清晰、能直接评审**的 PRD。这个 Agent 把这条路径产品化：

1. **① 澄清需求** —— 先别急着写。Agent 主动追问最关键的不确定点：目标用户是谁、要解决的核心问题、上线后用什么指标判断成功、MVP 边界在哪。每个问题都附「为什么问」和快捷选项。
2. **② 用户故事** —— 基于你的回答，产出 4~6 条结构化用户故事（角色 / 能力 / 价值），每条带可验证的验收标准，并标注 P0/P1/P2 优先级。
3. **③ PRD 草稿** —— 整合成一份完整文档：背景与问题、目标与非目标、目标用户、核心功能点、成功指标、风险与应对，可一键复制 Markdown 或下载 `.md`。

## 🤖 为什么说它是 Agent，而不是聊天机器人

界面会把 Agent 的每一步**显式画出来**，呈现经典的 **ReAct 循环**：

```
💭 思考(Think)  →  🔧 行动(Act：调用工具)  →  👁 观察(Observe)  →  ↩ 回喂  →  ✓ 交付(Answer)
```

- **思考**：模型用自然语言解释「现在该做什么、为什么」。
- **行动**：通过 **function-calling** 调用三个结构化工具之一（`clarify_requirements` / `draft_user_stories` / `compose_prd`），调用参数 JSON 可展开查看。
- **观察**：工具执行结果回喂给模型，作为下一步的输入。其中「澄清」是一个 **human-in-the-loop** 工具——它会暂停循环、等待你真实作答，再继续。
- **循环**直到模型不再调用工具，给出最终交付。

顶部的 **阶段进度条** 会随之点亮，让面试官一眼看懂当前走到哪一步。

## 🔌 两种运行模式

| 模式 | 是否需要 Key | 用途 |
| --- | --- | --- |
| **演示模式（默认）** | 否 | 零配置即可完整跑通三步循环。由一个脚本化的「模拟模型」扮演 function-calling，方便随时随地展示。 |
| **BYOK · 真实模型** | 是 | 填入自己的 API Key，由**真实大模型**通过 function-calling 驱动。兼容任何 **OpenAI Chat Completions 协议** 端点：OpenAI、DeepSeek、本地推理服务等。 |

两种模式共用**同一套** Agent 编排逻辑、系统提示词与工具 schema —— 演示模式不是「假页面」，而是把真实模型替换成了可预测的桩，行为契约完全一致。

> 🔒 你的 API Key 只保存在浏览器本地 `localStorage`，不会上传到任何服务器（本项目也没有后端）。

## 🚀 运行方式

纯静态前端，**零依赖、零构建**。任选一种：

```bash
# 方式一：用任意静态服务器（推荐，ES Module 需要 http(s) 环境）
cd prd-agent
python3 -m http.server 8080
# 然后打开 http://localhost:8080

# 方式二：用 npx serve
npx serve prd-agent
```

或直接部署到 GitHub Pages —— 访问仓库的 `/prd-agent/` 路径即可。

**接入真实模型**：点右上角 ⚙ → 选择 OpenAI / DeepSeek / 自定义预设 → 填入 Base URL、API Key、Model → 保存。徽标会从「演示模式」变为「真实模型」。

> 浏览器直连第三方 API 受 **CORS** 限制：OpenAI、DeepSeek 官方端点通常允许；若使用自建端点请确保已放开跨域。

## 🧱 项目结构

```
prd-agent/
├── index.html              # 页面骨架
├── styles.css              # 杂志风样式 + 深浅主题（CSS 变量）
└── js/
    ├── main.js             # 入口：主题 / 设置(BYOK) / 模式判定 / 运行编排
    ├── agent.js            # 与 provider、UI 解耦的 ReAct 循环
    ├── prompts.js          # 系统提示词 + 三个工具的 function schema
    ├── ui.js               # 把每一步可见化、澄清交互、PRD 渲染与 Markdown 导出
    └── providers/
        ├── demo.js         # 演示模式：脚本化模拟 function-calling
        └── openai.js       # 真实模式：OpenAI 协议 Chat Completions 客户端
```

## 🎨 设计思路（面试讲解要点）

- **Agent 可见化是核心叙事**。普通聊天产品把过程藏起来；这里刻意把 think/act/observe 拆成卡片、把工具调用的 JSON 暴露出来，因为 AIPM 的价值之一就是**理解并能讲清楚 Agent 的工作机制**。
- **human-in-the-loop 的取舍**。需求澄清不该由模型自问自答——它会暂停等真人输入，体现「Agent 自动化」与「关键决策留给人」之间的边界判断。
- **零配置可跑 + BYOK 真实驱动**，两者共用同一契约。这是为「演示场景」做的产品设计：面试现场网络/Key 不可控时也能稳定展示，同时不牺牲「能接真模型」的可信度。
- **结构化输出（function-calling）而非自由文本**。让模型把产出填进固定 schema，保证 PRD 各模块齐全、可直接渲染与导出，也更接近真实 Agent 工程实践。
- **克制的杂志风视觉**：暖纸色底、Playfair Display 标题 + Jost 正文，深浅主题随系统偏好自动切换，与同仓库的导航页保持一致的设计语言。

## 🆚 为什么不直接用扣子 / Dify

> 用扣子（Coze）或 Dify 拖一个 PRD bot，半小时就能搭出来。**之所以选择手写，恰恰是为了把"懂 Agent 机制"这件事展示出来**——而这是拖拽式平台体现不了的。

|  | 本项目 · PRD Agent | 扣子 (Coze) | Dify |
| --- | --- | --- | --- |
| 定位 | 一个**具体产品**（单一垂直场景） | AI Bot **搭建平台**（低代码/无代码） | 开源 **LLMOps 平台**（偏开发者/企业） |
| 构建 | 手写 ReAct 循环 + function-calling | 可视化拖拽节点编排 | 可视化编排 + Prompt IDE |
| 过程透明度 | think/act/observe **全程显式可见** | 黑盒，靠 trace 面板回看 | 有 workflow 日志/可观测性 |
| 知识库/RAG | 无（v1 不需要） | 内置 | 内置（核心能力） |
| 插件生态 | 自定义三个工具 | 插件市场 | 工具/插件 + API |
| 部署 | 纯静态、零后端、BYOK | 平台托管、多渠道发布 | 自部署或云版 |

**怎么定位这件事**：平台是"造 Agent 的工厂"，本项目是"一道亲手做的菜"。两者不在同一层——

- 它们解决"**怎么批量、快速造出很多 Agent**"；本项目解决"**把'写 PRD'这一件事做透，并讲清楚 Agent 底层怎么工作**"。
- 手写让我能讲清楚 **ReAct 循环、function-calling、human-in-the-loop 边界、结构化输出 vs 自由文本** 这些机制——而"懂机制 + 懂产品取舍"才是 AIPM 的核心。
- **平台是工具，不是能力的替代**。真实工作中我会按场景选型：要快速验证/给运营自助，就上扣子；要企业级 RAG + 自部署，就上 Dify；要深度定制和完全可控，才手写。

## 🗺 后续可迭代方向

- 把澄清答案做成多轮、可追问的对话，而不仅是一轮表单；
- PRD 支持在线编辑、版本对比与协作评论；
- 增加「竞品速查 / 指标基线」等检索类工具，让 Agent 具备真正的外部信息检索能力；
- 接入流式输出，让真实模型的「思考」逐字呈现。

---

_本目录是 [AIPM-Nav](../) 仓库下的独立子应用。Demo 产物仅为草稿，建议结合真实用户验证后迭代。_
