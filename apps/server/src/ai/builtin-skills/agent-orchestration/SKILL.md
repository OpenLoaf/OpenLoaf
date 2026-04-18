---
name: agent-orchestration-skill
description: >
  当主 Agent 面临多步骤复杂任务并正在判断要不要 / 怎样把子任务外包给内置子代理（browser / doc-editor / data-analyst / extractor / canvas-designer / coder 等）时触发。**不用于**：单步问答 / 读取 / 简单副作用（主 Agent 直接做）、已经明确要用 `Agent` 且知道 subagent_type 的场景。
version: 5.0.0
---

# 子代理委派与 Agent 工具

主 Agent 可以通过 `Agent` 工具按需调度内置或自定义子代理，把专业子任务外包出去。本 skill 回答四个问题：**何时委派、委派给谁、怎么调用、系统约束是什么**。

## 工具清单

| 工具 | 职责 | 只读 |
|------|------|------|
| `Agent` | 按 `subagent_type` 启动内置或自定义子代理处理多步复杂任务 | 否 |

> **加载**：`Agent` 为核心工具，始终可用，无需 `ToolSearch` 激活。

## 委派决策

```
用户消息 →
  ├─ 简单问答 / 闲聊 / 读取 / 查询 / 单步副作用（创建事件、发邮件、建项目）→ 主 Agent 直接做
  └─ 多步骤复杂任务 →
      ├─ 网页交互（点击/填表/登录/截图/翻页抓取）→ browser
      ├─ 富文本 / 长文档编辑（Markdown、DOCX、PDF）→ doc-editor
      ├─ 表格数据分析 / 图表生成 → data-analyst
      ├─ PDF / 图片 / 网页结构化提取 → extractor
      ├─ 画布节点操作 / 布局 → canvas-designer
      ├─ 代码编写 / 调试（仅全局模式；项目模式下 PM 自己做）→ coder
      └─ 混合任务 → 主 Agent 拆解后依次或并行委派多个子代理
```

**别"什么都委派"**：简单问答、单步操作、纯读任务用主 Agent 直接做。委派本身会引入上下文传递开销和额外步数，小任务得不偿失。

## 六个内置子代理

每个子代理都有独立的 system prompt 和工具集，步数按任务性质调整。

| 子代理 | 触发时机 | 工具集 | 步数 |
|---|---|---|---|
| 📝 **doc-editor** | 富文本/Markdown/Word/PDF 编辑，长文档改写 | Write, Read, Glob | 15 |
| 🌐 **browser** | 页面导航、DOM 交互、表单填写、截图、翻页抓取 | browser-*, WebSearch | 20 |
| 📊 **data-analyst** | CSV/Excel 清洗、统计计算、ECharts/Mermaid 图表 | Read, Write, Bash | 15 |
| 🔍 **extractor** | PDF/图片 OCR、表格抽取、多文档对比提取 | Read, office-read, WebFetch | 10 |
| 🎨 **canvas-designer** | 节点增删改、自动布局、文本到画布转换 | canvas-*, canvas-read | 15 |
| 💻 **coder** | 多语言代码编写/审查/调试 | Write, Read, Grep, Glob, Bash | 20 |

## Agent 工具调用

```
Agent { description: "爬取 A 站产品表", prompt: "...", subagent_type: "browser" }
```

| 参数 | 作用 |
|---|---|
| `description` | 短标题，向用户展示进度 |
| `prompt` | 交给子代理的完整指令 |
| `subagent_type` | 子代理类型 |

| subagent_type | 场景 | 能力 |
|---|---|---|
| `general-purpose` | 通用任务（默认） | 完整工具集 |
| `explore` | 代码库/文档探索、只读分析 | 只读工具 |
| `plan` | 方案设计、输出实现计划 | 只读工具 |
| 上表 6 个内置子代理名 | 专业任务 | 各子代理定义的工具集 |
| 自定义 Agent 名称 | 已注册的专业 Agent | Agent 定义的工具集 |

**Agent 工具默认同步等待**子代理完成并返回结果——调用后直接拿到输出继续下一步，不需要额外的等待工具。

## SendMessage：追加指令

子代理已创建但需要追加指令或修正方向时：

```
SendMessage { toolCallId: "agent-xxx", message: "补充要求：结果用 JSON 格式输出" }
```

`SendMessage` **自动恢复已停止的 agent**，不需要重新 `Agent` 创建，避免重新传递完整上下文的开销。

## 并行扇出-汇总

子任务互不依赖时，**在同一轮内同时发出多个 Agent 调用**，各自同步返回后主 Agent 汇总：

```
主 Agent 拆解任务 → 并行发出：
  Agent { description: "爬 A 站", subagent_type: "browser", prompt: "..." }
  Agent { description: "爬 B 站", subagent_type: "browser", prompt: "..." }
  Agent { description: "爬 C 站", subagent_type: "browser", prompt: "..." }
  ↓ 各自同步返回 A / B / C
主 Agent 汇总 → 最终回复
```

**能并行**：子任务独立、并行能显著缩短总耗时。
**不能并行**：后任务依赖前任务的输出（串行依赖）；总数超过并发上限 4 需要分批。

## 上下文继承

子代理自动继承主 Agent 的：

- **projectId** —— 同一项目沙箱，路径权限和文件访问一致
- **pageContext 对应的 skill** —— 子代理看得到相同的能力认知（主 Agent 在 email 页创建 extractor，后者也看得到 `email-ops`）
- **临时项目路径** —— 如果主 Agent 已创建临时项目，子代理共享该目录

这意味着你**不需要**在 prompt 里重复传递环境信息，子代理能从继承的上下文推导。

## 系统硬限制

| 限制 | 值 | 原因 |
|---|---|---|
| 最大委派深度 | 2（主 → 子，子不可再 spawn） | 每级复制上下文，层级越深 token 消耗指数增长；也避免级联失败难以定位 |
| 最大并发 | 4 个子代理 | 响应速度与系统资源（内存、API 连接）的平衡点 |
| 自动清理 | 5 分钟 | 完成后的 Agent 自动从内存删除，避免累积泄漏 |
| 步数硬限 | Master 200 / Sub 10-20 | Sub 按上表列出，Master 有更大余量处理协调工作 |

子代理的流式输出通过 `data-sub-agent-start / delta / chunk / end` 事件推送前端，每个 toolCallId 对应一条独立流，支持多个并发子代理同时流式输出。状态流转：`output-streaming` → `output-available` | `output-error`。

## 常见误判

- **别层级嵌套**：子代理不能再 spawn 子代理。需要更深层级时重新拆解，让主 Agent 按顺序调用多个子代理。
- **别用错类型**：要页面交互选 browser，只需读静态页用 WebFetch（主 Agent 自己就能调）；要 OCR 选 extractor，要精确 DOM 操作选 browser。
- **别在已有子代理时重新 `Agent`**：用 `SendMessage` 追加指令，复用已有上下文。
- **别把简单任务委派出去**：一次读取、一次查询、一次创建——主 Agent 自己做比委派快得多。
