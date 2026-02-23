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

## 多会话右侧栏（TabLayout RightChatPanel）

多会话 UI 不在 Chat 组件内部，而是统一由 `TabLayout.tsx` 的 `RightChatPanel` 渲染，保证会话栏与会话内容在同一层级管理：

- 会话列表来源：`tab.chatSessionIds` + `tab.activeSessionIndex`（见 `use-tabs.ts`）
- 右侧栏结构：顶部固定“新建会话”，中间为会话列表，底部为会话内容堆叠
- 会话内容：每个 session 都渲染一个 `Chat`，使用绝对定位叠在一起，非活跃会话保持挂载但 `opacity-0 pointer-events-none`
- 右键菜单（SessionBar）：重命名 / 上移 / 下移 / 关闭（仅移除本地 bar）
- 指示状态：
  - streaming：来自 `useChatRuntime().chatStatusBySessionId`
  - 未读：`updatedAt > lastSeenAt` + streaming 结束后补标
- `Chat` 根节点挂 `data-chat-active`，`SelectMode` 只遮罩活跃会话，避免其它会话被模糊

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
        │                 ├── MediaGenerateTool (图片/视频生成进度+结果+错误)
        │                 ├── ChartTool (chart-render 图表工具卡片)
        │                 ├── PlanTool (计划展示)
        │                 ├── OpenUrlTool / JsonRenderTool / CliThinkingTool
        │                 └── shared/ToolApprovalActions (审批 UI)
        └── MessageHuman (用户消息 + 图片预览 + @文件引用)
```

### Transient Parts（临时态）

- `part.isTransient === true` 会在 UI 中被替换为统一“状态条”，不展示具体内容。
- `isTransient` 仍会落库，但下一轮 LLM 输入链会过滤掉这些 part。

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

**案例：MediaGenerateTool**（`image-generate` / `video-generate`）

通过 `AnyToolPart.mediaGenerate` 字段接收流式状态（由 `ChatCoreProvider` 中 `handleMediaGenerateDataPart` 处理 SSE 事件写入）：

```typescript
mediaGenerate?: {
  status: 'generating' | 'done' | 'error'
  kind?: 'image' | 'video'
  prompt?: string
  progress?: number
  urls?: string[]
  errorCode?: string  // login_required | insufficient_credits | no_model | generation_failed
}
```

错误渲染：`MediaGenerateError` 根据 `errorCode` 显示登录按钮（`SaasLoginDialog`）、积分不足提示等。

## JSX 渲染（文件化渲染）

- 工具卡片：`message/tools/JsxCreateTool.tsx`
- 文件路径：`.tenas/chat-history/<sessionId>/jsx/<messageId>.jsx`
- 读取方式：`trpc.fs.readFile`（优先落盘内容，缺失时回退到工具输入）
- 刷新机制：`lib/chat/jsx-create-events.ts`
  - `WriteFileTool` 在 `apply-patch` 完成后解析 patch 路径并 `emitJsxCreateRefresh`
  - `JsxCreateTool` 监听事件后 `invalidateQueries` 重新读取
- 失败提示：当工具返回 `errorText` 且未拿到 JSX 内容时，卡片显示错误提示而不是空白
- 手动刷新：卡片右上角“刷新”按钮会强制重新拉取 JSX 文件
- 渲染失败上报：`JsxCreateTool` 捕获解析错误并写回 message parts（`errorText`），便于后续 AI 感知

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
| `input/SelectMode.tsx` | 模型选择与图标展示（`familyId` 优先，回退 `icon`），支持图像/视频模型交互选择 |
| `input/chat-model-selection-storage.ts` | 模型选择持久化（含 `MediaModelSelection`：imageModelId + videoModelId） |
| `input/chat-attachments.ts` | 附件类型定义 |
| `input/chat-input-utils.ts` | FILE_TOKEN_REGEX 等工具函数 |

### 模型选择规则

- 绑定 `projectId` 的 tab 优先使用**当前项目**的 `master`（`scope=project`，`isInherited=false`，`isEnabled=true`）。
- 当前项目不存在可用 `master` 时回退到工作空间 `master`。
- ChatInput 模型偏好保存随 `projectId` 走项目级；无 `projectId` 时保存到工作空间。

**能力标签渲染**: SelectMode 与设置页模型列表使用 `ModelDefinition.tags` 生成标签；`capabilities` 仅用于参数/媒体信息，不参与标签渲染。

**发送流程**: ChatInput 收集 input + attachments + options → `useChatMessageComposer` 组装 parts → `sendMessage()` → SSE transport

**图标主题适配**: `ModelIcon.tsx` 对非 Color 版本使用 `currentColor`，确保黑白图标在明暗主题下可见。

## Hooks Quick Reference

| Hook | 文件 | 作用 |
|------|------|------|
| `useChatBranchState` | `hooks/use-chat-branch-state.ts` | 分支状态管理（消息树→线性路径） |
| `useChatToolStream` | `hooks/use-chat-tool-stream.ts` | 工具流式数据聚合 |
| `useChatLifecycle` | `hooks/use-chat-lifecycle.ts` | 生命周期（提示音、快照同步） |
| `useChatModelSelection` | `hooks/use-chat-model-selection.ts` | 模型选择和能力判断，返回 `imageModelId` / `videoModelId` |
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
| `isApprovalPending()` 只检查 `approval-requested` 状态 | 应包含 `input-available` 状态（历史数据中模型流不完整导致的"准待审批"状态） |

## Tool Part 状态说明

| 状态 | 含义 | 前端行为 |
|------|------|----------|
| `input-streaming` | 工具参数流式接收中 | 显示加载/等待状态 |
| `input-available` | 工具输入就绪（历史数据可能是模型流不完整导致） | 显示为待审批/可提交状态 |
| `approval-requested` | 需要用户审批 | 显示审批按钮 |
| `output-streaming` | 工具执行中 | 显示执行进度 |
| `output-available` | 工具执行完成 | 显示执行结果 |
| `output-error` | 工具执行失败 | 显示错误信息 |

**关键函数**: `tool-utils.ts:isApprovalPending()` — 包含 `input-available` 状态判断

## Request-User-Input 审批续接

- `RequestUserInputTool` 提交后会把 `output.answers` 写回消息与 toolParts，并将状态置为 `output-available`。
- 多审批场景通过 `queueToolApprovalPayload()` + `continueAfterToolApprovals()` 统一续接，避免提前提交导致缺少工具结果。
- 需要持久化时使用 `trpc.chat.updateMessageParts` 写回（提交与跳过都要覆盖）。
