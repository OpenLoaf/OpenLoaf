---
name: ai-test-autofix
description: AI Agent 行为测试自动诊断与修复知识库。提供输出 JSON 结构解析、失败分类、修复策略矩阵。由 /ai-test-autofix 命令消费。
---

# AI Test Autofix — Skill 知识库

## Overview

本 Skill 为 `/ai-test-autofix` 命令提供知识支撑。它描述了 Promptfoo 测试输出的 JSON 结构、失败用例的分类体系以及对应的修复策略。

## 输出 JSON 结构说明

测试输出文件：`apps/server/.behavior-test-output.json`

```
{
  "results": {
    "results": [              // 每个测试用例的结果
      {
        "success": boolean,   // 总体是否通过
        "error": string?,     // Provider 级别错误（如超时、连接失败）
        "testCase": {
          "description": "e2e-001: 项目列表查询应使用 project-query",
          "vars": {
            "prompt": "现在有哪些项目",
            "turns": "[...]"   // 多轮对话时存在
          },
          "assert": [...]
        },
        "response": {
          "output": "Agent 的文本回复"
        },
        "gradingResult": {
          "pass": boolean,
          "score": number,
          "componentResults": [   // 每个断言的结果
            {
              "pass": boolean,
              "score": number,
              "reason": "失败原因描述",
              "assertion": {
                "type": "javascript" | "llm-rubric",
                "value": "断言代码或 rubric"
              }
            }
          ]
        },
        // Provider 返回的 metadata（由 E2E Provider 设置）
        "metadata": {
          "toolNames": ["project-query"],     // 调用的工具 ID 列表
          "toolCalls": [                      // 工具调用详情
            {
              "toolName": "project-query",
              "args": {...},
              "result": {...}
            }
          ],
          "toolCallCount": 1,
          "subAgentEvents": [...],            // 子 Agent 事件
          "hasSubAgentDispatch": false,
          "finishReason": "stop",
          "sessionId": "e2e-xxx"
        },
        "latencyMs": 5000
      }
    ]
  }
}
```

### 关键字段提取清单

| 字段路径 | 用途 |
|----------|------|
| `r.success` | 快速判断通过/失败 |
| `r.error` | 存在则为 PROVIDER_ERROR |
| `r.testCase.description` | 用例 ID（如 `e2e-001`） |
| `r.testCase.vars.prompt` | 原始用户输入 |
| `r.response.output` | Agent 完整回复 |
| `r.gradingResult.componentResults[].pass` | 单个断言是否通过 |
| `r.gradingResult.componentResults[].reason` | 失败原因（关键诊断信息） |
| `r.gradingResult.componentResults[].assertion.type` | 断言类型 |
| `r.metadata.toolNames` | 实际调用的工具列表 |
| `r.metadata.toolCalls` | 工具调用详情（参数+结果） |

## 失败分类决策树

```
r.error 存在?
├── YES → PROVIDER_ERROR（不可代码修复，跳过）
└── NO → 检查 componentResults[]
    ├── javascript 断言失败?
    │   ├── reason 包含 "未调用 xxx" → WRONG_TOOL
    │   │   （期望工具未在 toolNames 中）
    │   ├── reason 包含 "不应使用" / "错误调用了" → FORBIDDEN_TOOL
    │   │   （禁止工具出现在 toolNames 中）
    │   └── toolNames 为空 → NO_TOOL
    │       （Agent 没有调用任何工具）
    ├── llm-rubric 断言失败?
    │   └── OUTPUT_QUALITY
    │       （工具选择可能正确，但输出语义不满足）
    └── 两者都失败 → 优先处理 javascript 断言（工具选择）
```

### 失败类型速查

| 类型 | 特征 | 严重度 | 可自动修复 |
|------|------|--------|-----------|
| WRONG_TOOL | 期望的工具没被调用，调了其他工具 | 高 | 是 |
| FORBIDDEN_TOOL | 不该调用的工具被调用了 | 高 | 是 |
| NO_TOOL | Agent 直接回复，没调用任何工具 | 高 | 是 |
| OUTPUT_QUALITY | 工具选对了但回复质量不够 | 中 | 部分（prompt 调整） |
| PROVIDER_ERROR | 超时、连接失败、模型拒绝 | - | 否（环境问题） |

## 修复策略矩阵

| 失败类型 | 主要修复目标 | 次要修复目标 | 主要文件 |
|----------|-------------|-------------|---------|
| WRONG_TOOL | Master prompt 工具指引 | 工具描述 description | `prompt.zh.md` → `packages/api/src/types/tools/*.ts` |
| FORBIDDEN_TOOL | Master prompt 禁止规则 | 工具描述（让其更具针对性） | `prompt.zh.md` |
| NO_TOOL | Master toolIds 列表 | Master prompt 鼓励使用工具 | `master/index.ts` → `prompt.zh.md` |
| OUTPUT_QUALITY | Master prompt 输出指引 | 工具描述 return value 说明 | `prompt.zh.md` |
| PROVIDER_ERROR | 跳过 | - | - |

### 修复决策详解

#### WRONG_TOOL（调了错误的工具）
1. **检查 master/index.ts toolIds**：期望的工具是否在列表中？不在则添加
2. **检查 prompt.zh.md**：是否有明确的工具选择指引？添加场景→工具的映射规则
3. **检查工具描述**：期望工具的 description 是否足够明确，让 LLM 能够匹配用户意图
4. **检查 TOOL_ALIASES**：用户输入中的关键词是否需要新的别名映射

#### FORBIDDEN_TOOL（调了不该调的工具）
1. **检查 prompt.zh.md**：添加"当 X 场景时，不要使用 Y 工具"的禁止规则
2. **检查工具描述**：被错误调用的工具描述是否过于宽泛，需要缩窄其适用范围

#### NO_TOOL（没调用任何工具）
1. **检查 master/index.ts toolIds**：期望的工具是否在列表中
2. **检查 prompt.zh.md**：是否有"面对 X 类请求，应主动使用工具"的指引
3. **检查工具描述**：工具描述是否能让 LLM 知道何时该调用它

#### OUTPUT_QUALITY（输出质量不足）
1. **检查 prompt.zh.md**：添加输出格式或内容要求
2. **通常不需要修改工具代码**：这类问题多是 prompt 引导不够

## 关键文件速查表

| 用途 | 路径 |
|------|------|
| 测试用例定义 | `apps/server/src/ai/__tests__/agent-behavior/promptfooconfig.yaml` |
| 测试运行脚本 | `apps/server/scripts/run-behavior-test.mjs` |
| 测试输出文件 | `apps/server/.behavior-test-output.json` |
| E2E Provider | `apps/server/src/ai/__tests__/agent-behavior/openloaf-e2e-provider.ts` |
| Master 模板定义 | `apps/server/src/ai/agent-templates/templates/master/index.ts` |
| Master Prompt (中文) | `apps/server/src/ai/agent-templates/templates/master/prompt.zh.md` |
| Master Prompt (英文) | `apps/server/src/ai/agent-templates/templates/master/prompt.en.md` |
| 工具注册表 + 别名 | `apps/server/src/ai/tools/toolRegistry.ts` |
| 工具类型定义目录 | `packages/api/src/types/tools/` |
| Agent 工厂 | `apps/server/src/ai/services/agentFactory.ts` |

### 工具定义文件索引

| 工具 ID | 定义文件 |
|---------|---------|
| `project-query`, `project-mutate` | `packages/api/src/types/tools/db.ts` |
| `time-now` | `packages/api/src/types/tools/system.ts` |
| `task-manage`, `task-status` | `packages/api/src/types/tools/task.ts` |
| `email-query`, `email-mutate` | `packages/api/src/types/tools/email.ts` |
| `calendar-query`, `calendar-mutate` | `packages/api/src/types/tools/calendar.ts` |
| `read-file`, `list-dir`, `apply-patch`, `grep-files` | `packages/api/src/types/tools/runtime.ts` |
| `shell-command`, `shell`, `exec-command` | `packages/api/src/types/tools/runtime.ts` |
| `open-url` | `packages/api/src/types/tools/browser.ts` |
| `image-generate`, `video-generate` | `packages/api/src/types/tools/mediaGenerate.ts` |
| `js-repl`, `js-repl-reset` | `packages/api/src/types/tools/runtime.ts` |
| `jsx-create` | `packages/api/src/types/tools/jsxCreate.ts` |
| `chart-render` | `packages/api/src/types/tools/chart.ts` |
| `request-user-input` | `packages/api/src/types/tools/userInput.ts` |
| `spawn-agent`, `send-input`, `wait-agent`, `abort-agent` | `packages/api/src/types/tools/agent.ts` |
| `generate-widget`, `widget-*` | `packages/api/src/types/tools/widget.ts` |
| `office-execute` | `packages/api/src/types/tools/office.ts` |

## 修复护栏

### 禁止的修改
- **不得修改 `promptfooconfig.yaml` 中的 `assert` 断言** — 测试用例是需求规格，不是可以被绕过的代码
- **不得删除 master/index.ts 中已有的 toolIds** — 只能添加
- **不得大幅重写 prompt.zh.md** — 增量修改，每次只添加/调整最小必要的部分
- **不得修改 E2E Provider 或 Agent Provider** — 测试基础设施不在修复范围内
- **不得修改 toolRegistry.ts 中的 TOOL_REGISTRY 结构** — 只能修改 TOOL_ALIASES

### 修改范围限制
- 每次修复最多涉及 3 个文件
- 对 prompt.zh.md 的单次修改不超过 20 行
- 工具 description 的修改应保持原有语义，只做精准增强
- 如果修改了 prompt.zh.md，需考虑是否同步修改 prompt.en.md

### 迭代控制
- 最多 3 轮迭代
- 每轮迭代后必须重跑失败用例验证
- 如果连续 2 轮无进展（通过率不变），停止迭代
- 使用 `--filter-description` 只跑失败的用例，提高迭代速度

详细修复代码模式见 [references/fix-patterns.md](references/fix-patterns.md)。
