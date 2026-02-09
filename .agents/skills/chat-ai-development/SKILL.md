---
name: chat-ai-development
description: >
  Use when developing, extending, or debugging the Chat & AI system —
  frontend chat UI in apps/web/src/components/chat, backend AI agents
  in apps/server/src/ai, or full-stack features like adding tools,
  sub-agents, or modifying streaming behavior
---

# Chat & AI Development

## Overview

Chat & AI 系统分为前端 Chat UI 和后端 AI Agent 两层。前端基于 Vercel AI SDK `useChat` + 5 个 Context Provider 管理聊天状态；后端基于 `ToolLoopAgent` + `AsyncLocalStorage` 实现工具循环代理。两层通过 SSE 流式通信，工具接口通过 `@tenas-ai/api/types/tools/` 共享类型定义对齐。

## When to Use

- 修改聊天消息渲染（MessageList、MessageItem、MessageParts）
- 修改输入区域（ChatInput、命令菜单、附件、模型选择）
- 修改 Context Provider 或新增状态字段
- 修改分支导航、消息树逻辑
- 添加新工具（前端卡片 + 后端实现 + 类型定义）
- 添加新子代理
- 修改 Agent prompt 或 session preface
- 修改 SSE 流式管线
- 调试工具审批机制
- 修改模型注册或路由

## Architecture

```
┌─────────────────── 前端 (apps/web) ───────────────────┐
│  ChatCoreProvider (useChat 集成、消息树、分支导航)       │
│    ├── ChatStateProvider     (messages, status, error)  │
│    ├── ChatSessionProvider   (sessionId, siblingNav)    │
│    ├── ChatActionsProvider   (send, regenerate, retry)  │
│    ├── ChatOptionsProvider   (input, attachments)       │
│    └── ChatToolProvider      (toolParts, subAgentStreams)│
│              ↓ SSE transport                            │
├─────────────────── 后端 (apps/server) ─────────────────┤
│  AiExecuteController → AiExecuteService                 │
│    → ChatStreamUseCase → chatStreamService              │
│      ├── RequestContext (AsyncLocalStorage)              │
│      ├── resolveChatModel() → LanguageModelV3           │
│      ├── createMasterAgentRunner()                      │
│      │     └── ToolLoopAgent (tools from toolRegistry)  │
│      └── streamOrchestrator → UIMessageStreamWriter     │
│                                                         │
│  @tenas-ai/api/types/tools/ ← 前后端共享工具类型定义     │
└─────────────────────────────────────────────────────────┘
```

## Detailed References

按功能领域拆分为独立文件，按需查阅：

| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [chat-frontend.md](chat-frontend.md) | Context 架构、消息渲染管线、输入区、分支导航、Hooks 速查 | 修改前端聊天 UI |
| [ai-backend.md](ai-backend.md) | Agent 系统、工具注册、SSE 流式管线、RequestContext、审批机制 | 修改后端 AI 逻辑 |
| [fullstack-patterns.md](fullstack-patterns.md) | 添加新工具全流程（含前端执行/审批/UI 事件）、添加子代理、修改 Prompt、Skills 系统 | 新增功能或全栈修改 |

## Key Files Map

```
apps/web/src/components/chat/
├── Chat.tsx                    ← 主容器（拖拽、附件、模型选择）
├── ChatCoreProvider.tsx        ← 核心状态中枢 (~1290行)
├── context/
│   ├── ChatStateContext.tsx    ← messages, status, error
│   ├── ChatSessionContext.tsx  ← sessionId, branchMessageIds, siblingNav
│   ├── ChatActionsContext.tsx  ← send, regenerate, switchSibling, retry
│   ├── ChatOptionsContext.tsx  ← input, imageOptions, attachments
│   └── ChatToolContext.tsx     ← toolParts, subAgentStreams
├── hooks/                      ← 分支、工具流、生命周期、模型选择、消息组装
├── input/ChatInput.tsx         ← 主输入框
├── message/
│   ├── MessageList.tsx         ← 消息列表容器
│   ├── MessageItem.tsx         ← 单条消息（按 role 分发）
│   ├── MessageParts.tsx        ← Part 渲染 (renderMessageParts)
│   ├── tools/MessageTool.tsx   ← 工具路由 → UnifiedTool/SubAgentTool/PlanTool
│   ├── tools/OpenUrlTool.tsx   ← open-url 前端工具卡片
│   └── markdown/               ← Markdown 渲染组件
│
apps/web/src/lib/chat/
├── frontend-tool-executor.ts   ← 前端工具执行器 + handler 注册
└── open-url-ack.ts             ← Electron WebContentsView 加载等待
│
apps/web/src/components/layout/
└── TabLayout.tsx               ← 右侧多会话栏（RightChatPanel + 会话堆叠）
│
apps/server/src/ai/
├── bootstrap.ts                ← 依赖组装入口
├── interface/controllers/AiExecuteController.ts
├── services/chat/
│   ├── AiExecuteService.ts     ← 统一请求路由
│   ├── chatStreamService.ts    ← 核心编排 (~1037行)
│   └── streamOrchestrator.ts   ← SSE 流式响应构建
├── agents/
│   ├── masterAgent/
│   │   ├── masterAgent.ts      ← ToolLoopAgent 配置
│   │   ├── masterAgentRunner.ts
│   │   ├── skillsLoader.ts     ← .tenas/skills/ 扫描
│   │   └── masterAgentPrompt.zh.md
│   └── subagent/               ← Browser/DocumentAnalysis/TestApproval
├── tools/
│   ├── toolRegistry.ts         ← 工具注册表 (TOOL_REGISTRY)
│   ├── subAgentTool.ts         ← 子代理分发
│   ├── openUrl.ts              ← open-url 前端执行工具
│   ├── pendingRegistry.ts      ← 前端工具 Promise 注册/回执/超时
│   ├── fileTools.ts / shellTool.ts / browserAutomationTools.ts / ...
│   └── commandApproval.ts      ← 命令审批逻辑
├── interface/routes/
│   └── frontendToolAckRoutes.ts ← POST /ai/tools/ack 回执路由
├── shared/
│   ├── context/requestContext.ts ← AsyncLocalStorage 请求上下文
│   ├── messageConverter.ts      ← UIMessage → ModelMessage
│   ├── promptBuilder.ts         ← Prompt 构建
│   └── prefaceBuilder.ts        ← Session preface 构建
└── models/
    ├── modelRegistry.ts         ← 模型注册（JSON 加载）
    └── resolveChatModel.ts      ← 模型实例解析
│
packages/api/src/types/tools/    ← 前后端共享工具类型定义 (ToolDef)
```

## Skill Sync Policy

**当以下文件发生变更时，必须检查并同步更新本 skill：**

| 变更范围 | 需更新的文件 |
|----------|-------------|
| `context/*.tsx` Context 类型变更 | chat-frontend.md |
| `ChatCoreProvider.tsx` 核心逻辑变更 | chat-frontend.md |
| `components/layout/TabLayout.tsx` 多会话栏变更 | chat-frontend.md |
| `message/tools/` 新增或修改工具卡片 | chat-frontend.md |
| `hooks/` 新增或修改 hooks | chat-frontend.md |
| `tools/toolRegistry.ts` 工具注册变更 | ai-backend.md, fullstack-patterns.md |
| `agents/masterAgent/` Agent 配置变更 | ai-backend.md |
| `agents/subagent/` 新增或修改子代理 | ai-backend.md, fullstack-patterns.md |
| `shared/context/requestContext.ts` 上下文字段变更 | ai-backend.md |
| `services/chat/` 流式管线变更 | ai-backend.md |
| `tools/commandApproval.ts` 审批逻辑变更 | ai-backend.md |
| `@tenas-ai/api/types/tools/` 新增工具定义 | fullstack-patterns.md |
| `tools/pendingRegistry.ts` 前端执行机制变更 | fullstack-patterns.md |
| `lib/chat/frontend-tool-executor.ts` 执行器变更 | fullstack-patterns.md |
| `interface/routes/frontendToolAckRoutes.ts` 回执路由变更 | fullstack-patterns.md |
| `shared/promptBuilder.ts` Prompt 构建变更 | fullstack-patterns.md |
| `agents/masterAgent/skillsLoader.ts` 技能加载逻辑变更 | fullstack-patterns.md |

**同步规则**: 修改上述文件后，在提交前检查对应 skill 文件是否需要更新。保持 skill 与代码一致。
