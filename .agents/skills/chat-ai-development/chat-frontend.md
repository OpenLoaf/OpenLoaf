# Chat 前端组件开发

## Context 多层架构

`ChatCoreProvider`（~1290 行）集成 Vercel AI SDK `useChat`，通过 5 个 Context Provider 向子组件分发状态和动作：

| Context | Hook | 内容 |
|---------|------|------|
| `ChatStateProvider` | `useChatState()` | `messages`, `status`, `error`, `isHistoryLoading`, `stepThinking` |
| `ChatSessionProvider` | `useChatSession()` | `sessionId`, `branchMessageIds`, `siblingNav`, `workspaceId`, `projectId` |
| `ChatActionsProvider` | `useChatActions()` | `sendMessage`, `regenerate`, `stopGenerating`, `switchSibling`, `retryAssistantMessage`, `resendUserMessage`, `deleteMessageSubtree`, `newSession`, `selectSession`, `addToolApprovalResponse` |
| `ChatOptionsProvider` | `useChatOptions()` | `input`, `setInput`, `imageOptions`, `codexOptions`, `addAttachments` |
| `ChatToolProvider` | `useChatTools()` | `toolParts`（流式快照）, `subAgentStreams` |

## 消息渲染管线

```
MessageList (遍历 messages, 空态/思考态/错误态)
  └── MessageItem (按 role 分发, 支持编辑/重发/分支导航)
        ├── MessageAi → MessagePlan + MessageParts
        │     └── renderMessageParts()
        │           ├── text → Streamdown (Markdown)
        │           ├── reasoning → Streamdown (italic 虚线)
        │           ├── data-revised-prompt → 改写提示词
        │           ├── file → MessageFile
        │           └── tool-* → MessageTool (路由)
        │                 ├── UnifiedTool (通用卡片 + 审批按钮)
        │                 ├── SubAgentTool (子代理输出)
        │                 ├── PlanTool (计划展示)
        │                 ├── OpenUrlTool / JsonRenderTool / CliThinkingTool
        │                 └── shared/ToolApprovalActions (审批 UI)
        └── MessageHuman (用户消息 + 图片预览 + @文件引用)
```

## Adding a New Context Field

```typescript
// 1. 扩展类型 (context/ChatStateContext.tsx)
export type ChatStateContextValue = {
  // ... existing fields
  myNewField: string;
};

// 2. 在 ChatCoreProvider.tsx 中计算并传入
<ChatStateProvider value={{ ...existing, myNewField: computedValue }}>

// 3. 消费
const { myNewField } = useChatState();
```

## Adding a New Message Part Type

在 `message/MessageParts.tsx` 的 `renderMessageParts()` 中添加分支：

```typescript
if (part?.type === "my-custom-part") {
  if (!renderText) return null;
  return (
    <motion.div key={index} {...motionProps}>
      <MyCustomPartView data={part.data} />
    </motion.div>
  );
}
```

Part 类型由服务端 `UIMessageStreamWriter` 推送的 `data-part` 决定，确保前后端类型一致。

## Adding a New Tool Card

**方案 A（推荐）**: 大部分工具直接使用 `UnifiedTool`，提供折叠卡片 + 输入/输出展示 + 审批按钮。只需确保 `toolName` 正确即可。

**方案 B**: 需要自定义渲染时，在 `message/tools/` 创建组件，然后在 `MessageTool.tsx` 添加路由：

```typescript
if (resolvedPart.toolName === "my_tool") {
  return <MyTool part={resolvedPart} />;
}
```

## Branch Navigation

消息树采用 `parentMessageId` 链表结构：

- `branchMessageIds: string[]` — 当前活跃分支的线性路径
- `siblingNav: Record<string, ChatSiblingNav>` — 每条消息的兄弟导航（prevSiblingId, nextSiblingId, siblingIndex, siblingTotal）
- `leafMessageId` — 当前叶节点

**切换流程**: 点击 prev/next → `switchSibling()` → 服务端 `getChatView()` 返回新分支快照 → 覆盖本地 messages

## Input Area

| 文件 | 作用 |
|------|------|
| `input/ChatInput.tsx` | 主输入框（Plate.js 富文本、mention、拖拽上传） |
| `input/ChatCommandMenu.tsx` | 命令菜单（/ 触发） |
| `input/chat-attachments.ts` | 附件类型定义 |
| `input/chat-input-utils.ts` | FILE_TOKEN_REGEX 等工具函数 |

**发送流程**: ChatInput 收集 input + attachments + options → `useChatMessageComposer` 组装 parts → `sendMessage()` → SSE transport

## Hooks Quick Reference

| Hook | 文件 | 作用 |
|------|------|------|
| `useChatBranchState` | `hooks/use-chat-branch-state.ts` | 分支状态管理（消息树→线性路径） |
| `useChatToolStream` | `hooks/use-chat-tool-stream.ts` | 工具流式数据聚合 |
| `useChatLifecycle` | `hooks/use-chat-lifecycle.ts` | 生命周期（提示音、快照同步） |
| `useChatModelSelection` | `hooks/use-chat-model-selection.ts` | 模型选择和能力判断 |
| `useChatMessageComposer` | `hooks/use-chat-message-composer.ts` | 消息组装（text+附件+选项→parts） |

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 在 Context 外使用 `useChatState()` 等 hooks | 确保组件在 `ChatCoreProvider` 内部 |
| 直接修改 `messages` 数组 | 通过 `useChatActions()` 操作 |
| 工具卡片不处理 streaming 状态 | 检查 `part.state`（input-streaming/output-streaming/output-available） |
| 渲染工具时忽略 `toolParts` 流式快照 | `MessageTool` 已合并 `toolParts[toolCallId]` 到 `resolvedPart` |
| 分支切换后消息列表未更新 | 确认 `branchMessageIds` 变更触发了重渲染 |
| MessageParts 中新增 part 忘记处理 `renderText`/`renderTools` 开关 | 检查 `options.renderText !== false` |
| `status === "ready"` 时残留 streaming 状态 | `MessageTool` 已处理：ready 时强制终止 streaming |
