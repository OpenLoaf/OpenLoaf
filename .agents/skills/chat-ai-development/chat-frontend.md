
## Context 多层架构

`ChatCoreProvider`（~1290 行）集成 Vercel AI SDK `useChat`，通过 5 个 Context Provider 向子组件分发状态和动作：

| Context | Hook | 内容 |
|---------|------|------|
| `ChatStateProvider` | `useChatState()` | `messages`, `status`, `error`, `isHistoryLoading`, `stepThinking` |
| `ChatSessionProvider` | `useChatSession()` | `sessionId`, `branchMessageIds`, `siblingNav`, `projectId` |
| `ChatActionsProvider` | `useChatActions()` | `sendMessage`, `regenerate`, `stopGenerating`, `switchSibling`, `retryAssistantMessage`, `resendUserMessage`, `deleteMessageSubtree`, `newSession`, `selectSession`, `addToolApprovalResponse` |
| `ChatOptionsProvider` | `useChatOptions()` | `input`, `setInput`, `imageOptions`, `codexOptions`, `addAttachments` |
| `ChatToolProvider` | `useChatTools()` | `toolParts`（流式快照）, `subAgentStreams` |

## 多会话右侧栏（TabLayout RightChatPanel）

多会话 UI 不在 Chat 组件内部，而是统一由 `TabLayout.tsx` 的 `RightChatPanel` 渲染，保证会话栏与会话内容在同一层级管理：

- 会话列表来源：`tab.chatSessionIds` + `tab.activeSessionIndex`（见 `use-tabs.ts`）
- 右侧栏结构：中间为会话列表，底部为会话内容堆叠；不再渲染顶部固定“新建会话”条
- 会话内容：每个 session 都渲染一个 `Chat`，使用绝对定位叠在一起，非活跃会话保持挂载但 `opacity-0 pointer-events-none`
- 右键菜单（SessionBar）：重命名 / 上移 / 下移 / 关闭（仅移除本地 bar）
- 指示状态：
  - streaming：来自 `useChatRuntime().chatStatusBySessionId`
  - 未读：`updatedAt > lastSeenAt` + streaming 结束后补标
- `Chat` 根节点挂 `data-chat-active`，`SelectMode` 只遮罩活跃会话，避免其它会话被模糊
- `ChatHeader.tsx` 不再在聊天区内渲染标题行；顶部操作按钮（历史、调试、反馈、复制到画布、关闭面板、关闭会话等）通过 `useHeaderSlot().headerActionsTarget` portal 到程序级 `Header` 的 actions 区域
- “打开面板 / quick launch” 入口当前已隐藏；只有在已有 left dock base 时，才允许从 header 中显示“关闭面板”
- assistant 消息通过 `message/AssistantMessageHeader.tsx` 统一渲染头像与名称；优先读取 `message.agent.name / metadata.agent.name`，缺失时回退到 `ai.aiAssistant`

### 会话级项目关联

项目绑定从 Tab 级别下沉到 Session 级别，同一 Tab 内不同会话可关联不同项目：

- **存储**：`TabMeta.chatSessionProjectIds: Record<sessionId, projectId>`
- **同步**：`chatParams.projectId` 始终自动反映活跃会话的项目，下游消费者（Chat/ChatCoreProvider/use-chat-sessions）无需修改
- **项目选择器**（ChatInput `handleProjectChange`）：调用 `setSessionProjectId(tabId, sessionId, projectId)` 而非 `setTabChatParams`
- **历史会话加载**（ChatHeader `onSelect`）：选择历史会话时，将其 `projectId` 写入映射后再 `selectSession`
- **新建会话**：自动继承当前活跃会话的 projectId
- **会话列表过滤**：`useChatSessions` 从 `chatParams.projectId` 读取，同步机制保证反映活跃会话

### 会话级 LeftDock 状态

切换会话时，整个 LeftDock 状态（base + stack + 布局参数）按会话保存/恢复：

- **快照存储**：`TabRuntime.dockSnapshotBySessionId: Record<sessionId, DockSnapshot>`
- **切换流程**：`saveDockSnapshot(old)` → `restoreDockSnapshot(new)` → 无快照时 fallback 到 `applyPlantPageForProject`
- **projectTab 保留**：切项目时 plant-page 的子页签（files/canvas/tasks 等）保持不变
- **Workspace → 项目**：自动创建 plant-page base 并设置默认宽度

### 侧边栏智能匹配（ProjectTree `openProjectTab`）

点击侧边栏项目时的查找优先级：
1. 当前 Tab 的 `chatSessionProjectIds` 中查找匹配 sessionId → 切换到该会话
2. 其他 Tab 的 `chatSessionProjectIds` 中查找 → 切换到该 Tab + 会话
3. 都没有 → 创建新 Tab

### Transient Parts（临时态）

- `part.isTransient === true` 会在 UI 中被替换为统一“状态条”，不展示具体内容。
- `isTransient` 仍会落库，但下一轮 LLM 输入链会过滤掉这些 part。

## Adding a New Message Part Type

在 `message/MessageParts.tsx` 的 `renderMessageParts()` 中添加分支：

Part 类型由服务端 `UIMessageStreamWriter` 推送的 `data-part` 决定，确保前后端类型一致。

## Adding a New Tool Card

**方案 A（推荐）**: 大部分工具直接使用 `UnifiedTool`，提供折叠卡片 + 输入/输出展示 + 审批按钮。只需确保 `toolName` 正确即可。

**方案 B**: 需要自定义渲染时，在 `message/tools/` 创建组件，然后在 `MessageTool.tsx` 添加路由：

**案例：MediaGenerateTool**（`image-generate` / `video-generate`）

通过 `AnyToolPart.mediaGenerate` 字段接收流式状态（由 `ChatCoreProvider` 中 `handleMediaGenerateDataPart` 处理 SSE 事件写入）：

错误渲染：`MediaGenerateError` 根据 `errorCode` 显示登录按钮（`SaasLoginDialog`）、积分不足提示等。

## JSX 渲染（文件化渲染）

- 工具卡片：`message/tools/JsxCreateTool.tsx`
- 文件路径：`.openloaf/chat-history/<sessionId>/jsx/<messageId>.jsx`
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
| `input/ChatInput.tsx` | 主输入框（ContentEditable 富文本、mention、拖拽上传） |
| `input/ChatInputEditor.tsx` | ContentEditable 编辑器（芯片渲染、值↔DOM 双向转换） |
| `input/ChatCommandMenu.tsx` | 斜杠菜单（/ 触发，显示可用技能列表） |
| `input/SelectMode.tsx` | 模型选择与图标展示（`familyId` 优先，回退 `icon`），支持图像/视频模型交互选择 |
| `input/chat-model-selection-storage.ts` | 模型选择持久化（含 `MediaModelSelection`：imageModelId + videoModelId） |
| `input/chat-attachments.ts` | 附件类型定义 |
| `input/chat-input-utils.ts` | FILE_TOKEN_REGEX 等工具函数 |

### ChatInput 内联芯片（Chip）渲染规范

ChatInput 使用 ContentEditable 编辑器（`ChatInputEditor.tsx`），通过 `valueToHtml` 将纯文本值渲染为带内联芯片的 HTML。所有芯片遵循以下规则：

**芯片类型**

| 类型 | 正则 | CSS 类 | 颜色 | 示例 |
|------|------|--------|------|------|
| 文件引用 | `@{path}` | `ol-mention-chip` | 蓝色 (blue-200/blue-700) | `@{src/index.ts}` |
| 技能命令 | `/skill/name` | `ol-skill-chip` | 紫色 (purple-200/purple-700) | `/skill/frontend-testing` |

**芯片渲染条件（重要）**

芯片 token 后必须紧跟**空白字符**或**非 ASCII 字符**才会渲染为芯片组件，否则显示为纯文本。这防止用户删除分隔符后继续输入时破坏 token 名称。

- `/skill/frontend-testing 讲什么` → ✅ 芯片 + 文本
- `/skill/frontend-testing讲什么` → ✅ 芯片 + 文本（中文为非 ASCII）
- `/skill/frontend-testingabc` → ❌ 纯文本（英文字符紧邻，无法确定边界）

**隐形分隔符（重要）**

芯片渲染时，`valueToHtml` 将紧跟的空格吸收进 `data-token` 属性中，HTML 不再渲染这个空格。用户视觉上看不到间隙，但 `domToValue` 从 `data-token` 读回时空格仍在，保证值 round-trip 一致。

实现要点：
1. `data-token` 存储完整 token + 尾部空格（如 `"/skill/xxx "`）
2. `lastIndex` 跳过被吸收的空格
3. `domToValue` 直接读 `el.dataset.token`，空格自动还原

**新增芯片类型时的清单**

1. 在 `ChatInputEditor.tsx` 中：
   - 添加 CSS 类常量和样式到 `CHIP_STYLES`
   - 扩展 `valueToHtml` 正则，添加匹配分支
   - 确保使用 `(?=\s|[^\x00-\x7F])` lookahead（输入框中不匹配字符串末尾）
   - 将尾部空格吸收进 `data-token`，HTML 不渲染
   - 扩展 `domToValue` 识别新芯片类（已有通用逻辑，通常只需加 class 判断）
   - 扩展 `isEmpty` / `updateDomEmpty` 的选择器
2. 在 `message/text-tokenizer.ts` 中：
   - 添加新 token 类型到 `ChatTextToken`
   - 在 `splitCommandSegments` 中添加匹配（使用 `(?=\s|[^\x00-\x7F]|$)` — 消息已发送，允许末尾匹配）
3. 在 `message/ChatMessageText.tsx` 中：
   - 添加新 token 类型的渲染分支
   - 点击行为通过共享函数实现（如 `openSkillInStack`，定义在 `setting/skills/skill-utils.ts`）
4. 如有点击交互，在 `ChatInputEditor` 添加 `onXxxChipClick` 回调，在 `ChatInput` 中接入

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
| 用 `setTabChatParams({ projectId })` 修改项目 | 必须用 `setSessionProjectId(tabId, sessionId, projectId)` 保持映射同步 |
| 删除会话时忘记清理 dock snapshot | `handleRemoveSession` 须同时调用 `clearDockSnapshot(tabId, id)` |
| 芯片正则不加 lookahead，用户删空格后名称被破坏 | `valueToHtml` 中使用 `(?=\s\|[^\x00-\x7F])` 确保边界；text-tokenizer 中额外允许 `\|$` |
| 芯片后空格对用户可见 | `valueToHtml` 必须将尾部空格吸收进 `data-token`，HTML 中不渲染该空格 |
| 新增芯片类型但未同步 text-tokenizer | 输入框和消息气泡两处都需要处理，否则发送后芯片消失 |

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
