// 系统提示词 + function-calling 工具 schema
// 这套定义同时用于「真实模型（OpenAI 协议）」与「演示模式（脚本化模拟）」，
// 保证两种模式下 Agent 的行为契约完全一致。

export const SYSTEM_PROMPT = `你是一个资深的 AI 产品经理助手，名为「PRD Agent」。
你的任务：把用户一句粗略的产品想法，转化为一份结构完整、可执行的 PRD 草稿。

你必须严格按照以下三步循环工作，每一步都通过调用对应工具完成，不要跳步：

1. clarify_requirements —— 先针对最关键的不确定性向用户提出 3~4 个澄清问题，
   至少覆盖：目标用户是谁、要解决的核心问题/场景、上线后用什么指标判断成功。
   每个问题给出简短的「为什么问」，并尽量附 2~3 个可选项方便用户快速选择。
   如果用户的回答仍然含糊（例如成功指标没有量化、目标用户不够具体），
   可以再用 clarify_requirements 追问一轮（最多两轮），把关键信息钉实后再进入下一步。
2. draft_user_stories —— 拿到用户答案后，产出 4~6 条结构化用户故事，
   每条包含角色、能力诉求、价值，并给出 2~3 条可验证的验收标准；标注优先级（P0/P1/P2）。
3. compose_prd —— 最后产出完整 PRD，包含背景、目标与非目标、目标用户、
   核心功能点、用户故事、验收标准、成功指标、风险与应对。

要求：
- 思考过程要简洁、专业，体现产品判断（取舍、优先级、指标设计）。
- 充分利用用户在澄清环节给出的真实回答，让 PRD 贴合其意图。
- 全程使用中文。
- 三个工具依次各调用一次后，用一句话向用户交付结论并结束（不要再调用工具）。`;

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "clarify_requirements",
      description: "向用户提出关键澄清问题，覆盖目标用户、核心问题、成功指标等不确定点。",
      parameters: {
        type: "object",
        properties: {
          thought: { type: "string", description: "为什么现在需要澄清，以及你打算澄清哪些关键点（一句话）。" },
          questions: {
            type: "array",
            description: "3~4 个澄清问题。",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "问题的英文短标识，如 target_user / core_problem / success_metric / mvp_scope。" },
                question: { type: "string", description: "向用户提出的问题。" },
                why: { type: "string", description: "为什么问这个问题（一句话）。" },
                options: { type: "array", items: { type: "string" }, description: "2~3 个可选项，便于用户快速选择。" }
              },
              required: ["id", "question", "why"]
            }
          }
        },
        required: ["thought", "questions"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_user_stories",
      description: "根据想法与用户澄清答案，产出结构化用户故事与验收标准。",
      parameters: {
        type: "object",
        properties: {
          thought: { type: "string", description: "你如何从答案推导出这些故事与优先级（一句话）。" },
          stories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                role: { type: "string", description: "用户角色，如「考研备考的大学生」。" },
                capability: { type: "string", description: "希望具备的能力。" },
                benefit: { type: "string", description: "由此获得的价值。" },
                priority: { type: "string", enum: ["P0", "P1", "P2"] },
                acceptance_criteria: { type: "array", items: { type: "string" }, description: "2~3 条可验证的验收标准。" }
              },
              required: ["role", "capability", "benefit", "priority", "acceptance_criteria"]
            }
          }
        },
        required: ["thought", "stories"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compose_prd",
      description: "产出完整的 PRD 草稿文档。",
      parameters: {
        type: "object",
        properties: {
          thought: { type: "string", description: "组织这份 PRD 时的取舍要点（一句话）。" },
          title: { type: "string" },
          one_liner: { type: "string", description: "一句话产品定位。" },
          background: { type: "string", description: "背景与问题陈述。" },
          goals: { type: "array", items: { type: "string" } },
          non_goals: { type: "array", items: { type: "string" }, description: "明确不做的事，用于划定边界。" },
          target_users: {
            type: "array",
            items: {
              type: "object",
              properties: { persona: { type: "string" }, description: { type: "string" } },
              required: ["persona", "description"]
            }
          },
          features: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                priority: { type: "string", enum: ["P0", "P1", "P2"] }
              },
              required: ["name", "description", "priority"]
            }
          },
          metrics: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, target: { type: "string" } },
              required: ["name", "target"]
            }
          },
          risks: {
            type: "array",
            items: {
              type: "object",
              properties: { risk: { type: "string" }, mitigation: { type: "string" } },
              required: ["risk", "mitigation"]
            }
          }
        },
        required: ["title", "background", "goals", "target_users", "features", "metrics", "risks"]
      }
    }
  }
];
