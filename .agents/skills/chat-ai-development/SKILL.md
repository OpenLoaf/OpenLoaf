---
name: chat-ai-development
description: >
  Use when developing, extending, or debugging the Chat & AI system —
  frontend chat UI in apps/web/src/components/chat, backend AI agents
  in apps/server/src/ai, or full-stack features like adding tools,
  sub-agents, or modifying streaming behavior
---

# Chat & AI Development

> **术语映射**：代码 `workspace` = 产品「工作空间」，代码 `project` = 产品「项目」。

## Overview

Chat & AI 系统分为前端 Chat UI 和后端 AI Agent 两层。前端基于 Vercel AI SDK `useChat` + 5 个 Context Provider 管理聊天状态；后端基于 `ToolLoopAgent` + `AsyncLocalStorage` 实现工具循环代理。两层通过 SSE 流式通信，工具接口通过 `@openloaf/api/types/tools/` 共享类型定义对齐。

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

## Detailed References

按功能领域拆分为独立文件，按需查阅：

| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [chat-frontend.md](chat-frontend.md) | Context 架构、消息渲染管线、输入区、分支导航、Hooks 速查 | 修改前端聊天 UI |
| [ai-backend.md](ai-backend.md) | Agent 系统、工具注册、SSE 流式管线、RequestContext、审批机制 | 修改后端 AI 逻辑 |
| [fullstack-patterns.md](fullstack-patterns.md) | 添加新工具全流程（含前端执行/审批/UI 事件）、添加子代理、修改 Prompt、Skills 系统 | 新增功能或全栈修改 |

## Skill Sync Policy

**当以下文件发生变更时，必须检查并同步更新本 skill：**

| 变更范围 | 需更新的文件 |
|----------|-------------|
| `context/*.tsx` Context 类型变更 | chat-frontend.md |
| `ChatCoreProvider.tsx` 核心逻辑变更 | chat-frontend.md |
| `components/layout/TabLayout.tsx` 多会话栏变更 | chat-frontend.md |
| `hooks/tab-types.ts` / `hooks/use-tabs.ts` Tab/Session 数据模型变更 | chat-frontend.md |
| `hooks/use-tab-runtime.ts` Dock snapshot 机制变更 | chat-frontend.md |
| `components/layout/sidebar/ProjectTree.tsx` 项目匹配逻辑变更 | chat-frontend.md |
| `message/tools/` 新增或修改工具卡片 | chat-frontend.md |
| `hooks/` 新增或修改 hooks | chat-frontend.md |
| `tools/toolRegistry.ts` 工具注册变更 | ai-backend.md, fullstack-patterns.md |
| `tools/toolInputValidation.ts` 验证包装逻辑变更 | ai-backend.md |
| `tools/toolSearchState.ts` 激活状态逻辑变更 | ai-backend.md |
| `tools/toolSearchTool.ts` 工具搜索逻辑变更 | ai-backend.md |
| `tools/capabilityGroups.ts` 能力组变更 | ai-backend.md, fullstack-patterns.md |
| `agents/masterAgent/` Agent 配置变更 | ai-backend.md |
| `agents/subagent/` 新增或修改子代理 | ai-backend.md, fullstack-patterns.md |
| `shared/context/requestContext.ts` 上下文字段变更 | ai-backend.md |
| `services/chat/` 流式管线变更 | ai-backend.md |
| `tools/commandApproval.ts` 审批逻辑变更 | ai-backend.md |
| `@openloaf/api/types/tools/` 新增工具定义 | fullstack-patterns.md |
| `tools/pendingRegistry.ts` 前端执行机制变更 | fullstack-patterns.md |
| `lib/chat/frontend-tool-executor.ts` 执行器变更 | fullstack-patterns.md |
| `interface/routes/frontendToolAckRoutes.ts` 回执路由变更 | fullstack-patterns.md |
| `shared/promptBuilder.ts` Prompt 构建变更 | fullstack-patterns.md |
| `agents/masterAgent/skillsLoader.ts` 技能加载逻辑变更 | fullstack-patterns.md |

**同步规则**: 修改上述文件后，在提交前检查对应 skill 文件是否需要更新。保持 skill 与代码一致。
