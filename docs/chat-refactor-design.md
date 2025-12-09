# Chat 功能架构设计

## 功能清单

### 核心功能

1. **消息发送** - 用户输入消息并发送给AI
2. **消息接收** - 接收AI的流式回复
3. **消息展示** - 展示用户消息和AI消息
4. **消息重发** - 从指定消息重新开始对话
5. **消息复制** - 复制消息内容到剪贴板

### 会话管理

6. **会话切换** - 在不同会话间切换
7. **会话创建** - 创建新会话
8. **会话加载** - 加载历史会话消息
9. **会话持久化** - 自动保存会话和消息

### 状态管理

10. **思考状态** - 显示AI正在思考
11. **加载状态** - 显示消息加载中
12. **发送状态** - 显示消息发送中
13. **错误处理** - 显示错误信息

### 工具集成

14. **工具调用** - 处理AI工具调用请求
15. **Human-in-loop** - 人机交互工具（问卷调查等）
16. **工具结果** - 处理工具执行结果

### 用户体验

17. **自动滚动** - 新消息自动滚动到底部
18. **Token统计** - 显示Token使用情况
19. **输入框管理** - 输入框状态和验证
20. **欢迎消息** - 空会话时显示欢迎消息

---

## React 组件架构

### 组件层次结构

```text
ChatInterface (容器组件)
├── ChatScrollArea (滚动容器)
│   └── MessageList (消息列表)
│       ├── WelcomeMessage (欢迎消息)
│       ├── MessageItem (单条消息)
│       │   ├── UserMessage (用户消息)
│       │   ├── AIMessage (AI消息)
│       │   │   ├── MessageContent (消息内容)
│       │   │   ├── ToolCallDisplay (工具调用展示)
│       │   │   └── MessageActions (消息操作)
│       │   └── ThinkingIndicator (思考指示器)
│       └── ErrorMessage (错误消息)
└── ChatInputPanel (输入面板)
    ├── ChatTextarea (输入框)
    ├── ChatActions (操作按钮)
    │   ├── NewSessionButton (新建会话)
    │   ├── ModeSelector (模式选择)
    │   ├── TokenDisplay (Token显示)
    │   └── SendButton (发送按钮)
    └── ToolResultHandler (工具结果处理)
```

### 组件职责划分

#### 1. 容器层组件

##### ChatInterface

- 职责：整体布局和状态协调
- Props：`sessionId`, `onMessageSend`, `onNewSession`, `onMessagesChange`
- 使用Hook：`useChat`

##### ChatScrollArea

- 职责：滚动容器，管理滚动行为
- Props：`children`, `onScroll`
- 功能：自动滚动到底部

#### 2. 消息展示组件

##### MessageList

- 职责：消息列表容器
- Props：`messages`, `isLoading`, `isThinking`, `error`
- 功能：条件渲染（加载/空状态/消息列表/错误）

##### MessageItem

- 职责：单条消息容器
- Props：`message`, `isThinking`, `isLastMessage`, `isCopied`
- 功能：根据消息角色渲染不同组件

##### UserMessage

- 职责：用户消息展示
- Props：`message`, `onCopy`, `onRefresh`
- 功能：纯展示，无业务逻辑

##### AIMessage

- 职责：AI消息展示
- Props：`message`, `isThinking`, `onCopy`, `onRefresh`, `onToolResult`
- 功能：展示AI回复、工具调用、思考状态

##### MessageContent

- 职责：消息内容渲染（Markdown等）
- Props：`content`, `parts`
- 功能：渲染文本、代码块等

##### ToolCallDisplay

- 职责：工具调用展示
- Props：`toolCall`, `onResult`
- 功能：根据工具类型渲染不同UI

##### MessageActions

- 职责：消息操作按钮
- Props：`message`, `onCopy`, `onRefresh`
- 功能：复制、重发等操作

#### 3. 输入组件

##### ChatInputPanel

- 职责：输入区域容器
- Props：`input`, `onInputChange`, `onSubmit`, `onStop`, `disabled`, `isSending`
- 功能：整合输入框和操作按钮

##### ChatTextarea

- 职责：文本输入框
- Props：`value`, `onChange`, `onKeyDown`, `disabled`, `placeholder`
- 功能：多行输入，Enter发送

##### ChatActions

- 职责：操作按钮组
- Props：`onNewSession`, `onSubmit`, `onStop`, `isSending`, `tokenUsage`
- 功能：新建会话、发送、停止、Token显示

#### 4. 工具组件

##### HumanInLoopTool

- 职责：人机交互工具UI
- Props：`toolCallId`, `input`, `output`, `state`, `onResult`
- 功能：问卷调查、用户确认等交互

---

## ai-sdk 集成设计

### 核心原则

**充分利用 `useChat` hook**：ai-sdk v6 的 `useChat` 已经提供了完整的聊天功能，设计应该基于它进行扩展，而不是重新实现。

### useChat 提供的功能

**状态**（自动管理）：

- `messages: UIMessage[]` - 消息列表，自动更新
- `status: 'idle' | 'submitted' | 'streaming'` - 当前状态
- `error: Error | undefined` - 错误对象
- `id: string` - 聊天ID

**操作**（直接使用）：

- `sendMessage(message)` - 发送消息，自动处理流式响应
- `setMessages(messages)` - 更新消息列表
- `regenerate()` - 重新生成最后一条AI回复
- `stop()` - 停止当前生成
- `resumeStream()` - 恢复流式响应
- `addToolResult(...)` - 添加工具执行结果
- `addToolOutput(...)` - 添加工具输出
- `addToolApprovalResponse(...)` - 添加工具审批响应
- `clearError()` - 清除错误

**配置选项**：

- `transport` - 自定义传输层（API调用）
- `onFinish` - 完成回调
- `onError` - 错误回调
- `onToolCall` - 工具调用回调
- `sendAutomaticallyWhen` - 自动发送条件

### 设计策略

1. **直接使用**：在 `ChatProvider` 中直接调用 `useChat`
2. **状态映射**：将 `useChat` 的状态映射到 Context
3. **方法暴露**：直接暴露或封装 `useChat` 的方法
4. **扩展功能**：只添加 `useChat` 未提供的功能（Token统计、会话管理等）

---

## Hook 架构设计

### ai-sdk 提供的 Hook

**`useChat` (来自 @ai-sdk/react)**

ai-sdk v6 已经提供了完整的聊天功能，包括：

**状态**：

- `messages` - 消息列表
- `status` - 状态（idle/submitted/streaming）
- `error` - 错误对象
- `id` - 聊天ID

**操作**：

- `sendMessage` - 发送消息
- `setMessages` - 更新消息列表
- `regenerate` - 重新生成回复
- `stop` - 停止生成
- `resumeStream` - 恢复流式响应
- `addToolResult` - 添加工具结果
- `addToolOutput` - 添加工具输出
- `addToolApprovalResponse` - 添加工具审批响应
- `clearError` - 清除错误

**设计原则**：充分利用 `useChat` 提供的功能，避免重复实现。

### Hook 层次结构

```text
useChat (ai-sdk提供，核心功能)
├── ChatContext (封装useChat，添加业务逻辑)
│   ├── useSession (会话管理，基于useChat.id)
│   ├── useMessages (消息管理，基于useChat.messages)
│   └── useUIState (UI状态，补充useChat未提供的)
├── useChatActions (操作封装，基于useChat的方法)
│   ├── useSendMessage (封装useChat.sendMessage)
│   ├── useResendMessage (基于useChat.setMessages + sendMessage)
│   └── useToolHandling (基于useChat.addToolResult等)
└── useChatEffects (副作用管理)
    ├── useAutoScroll (自动滚动)
    ├── useMessageLoading (消息加载，配合useChat.setMessages)
    └── useTokenTracking (Token追踪，从消息metadata提取)
```

### Hook 职责划分

#### 1. 核心Hook（ai-sdk提供）

##### useChat

- **来源**：`@ai-sdk/react`
- **职责**：核心聊天功能（消息管理、流式响应、工具调用）
- **直接使用**：在 `ChatContext` 中直接调用
- **不重复实现**：消息发送、流式处理、工具调用等核心功能

#### 2. Context层Hook（封装useChat）

##### useChat (自定义，封装ai-sdk的useChat)

- **职责**：对外暴露的统一接口
- **实现**：在 `ChatContext` 中调用 `useChat`，并添加业务逻辑
- **返回**：`useChat` 的返回值 + 扩展的业务状态和操作
- **依赖**：`ChatContext`

##### useChatState

- **职责**：统一状态管理（基于 `useChat`）
- **状态**：会话、消息（来自 `useChat.messages`）、UI、Token、工具
- **功能**：状态初始化和更新，整合 `useChat` 的状态

##### useSession

- 职责：会话相关状态
- 状态：`sessionId`, `title`, `isLoading`
- 功能：会话切换、创建、加载

##### useMessages

- **职责**：消息相关状态（基于 `useChat.messages`）
- **状态**：`messages`（来自 `useChat.messages`）, `isLoading`（来自 `useChat.status`）, `error`（来自 `useChat.error`）
- **功能**：消息增删改查（使用 `useChat.setMessages`）

##### useUIState

- 职责：UI相关状态
- 状态：`input`, `isThinking`, `isSending`, `scrollPosition`
- 功能：UI状态管理

#### 3. 操作Hook（基于useChat的方法）

##### useChatActions

- **职责**：封装所有操作（基于 `useChat` 的方法）
- **功能**：发送、重发、删除、工具处理
- **实现**：直接使用或封装 `useChat` 提供的方法

##### useSendMessage

- **职责**：发送消息逻辑（封装 `useChat.sendMessage`）
- **功能**：创建消息、调用 `useChat.sendMessage`、处理回调
- **不重复实现**：流式响应处理由 `useChat` 自动处理

##### useResendMessage

- **职责**：重发消息逻辑（基于 `useChat.setMessages` + `sendMessage`）
- **功能**：使用 `useChat.setMessages` 删除后续消息，然后调用 `useChat.sendMessage`
- **实现**：组合使用 `useChat` 的方法

##### useToolHandling

- **职责**：工具调用处理（基于 `useChat.addToolResult` 等）
- **功能**：工具调用、结果处理、Human-in-loop
- **实现**：使用 `useChat.addToolResult`、`addToolOutput`、`addToolApprovalResponse`

#### 4. 副作用Hook（补充功能）

##### useAutoScroll

- **职责**：自动滚动管理
- **功能**：监听 `useChat.messages` 变化，自动滚动到底部
- **依赖**：`useChat.messages`

##### useMessageLoading

- **职责**：消息加载管理
- **功能**：加载历史消息、使用 `useChat.setMessages` 更新消息列表
- **依赖**：`useChat.setMessages`

##### useTokenTracking

- **职责**：Token统计管理
- **功能**：从 `useChat.messages` 的 metadata 中提取 Token 使用信息
- **依赖**：`useChat.messages`（从消息的 metadata 中读取）

##### useClipboard

- **职责**：剪贴板管理
- **功能**：复制消息、管理复制状态
- **独立功能**：不依赖 `useChat`

---

## 状态管理架构

### Context 设计

#### ChatContext

- **核心**：内部使用 `useChat` hook（来自 ai-sdk）
- **职责**：封装 `useChat`，添加业务逻辑和扩展状态
- **原则**：充分利用 `useChat` 提供的功能，只添加必要的扩展

**状态结构**（基于 `useChat` + 扩展）

```json
{
  "chat": {
    "messages": [], // 来自 useChat.messages
    "status": "idle", // 来自 useChat.status
    "error": null, // 来自 useChat.error
    "id": "" // 来自 useChat.id
  },
  "session": {
    "id": "", // 基于 useChat.id
    "title": "",
    "isLoading": false
  },
  "ui": {
    "input": "", // 扩展：输入框状态
    "isThinking": false, // 扩展：思考状态（基于 status）
    "scrollPosition": 0 // 扩展：滚动位置
  },
  "tokenUsage": {
    "total": 0, // 从 messages metadata 提取
    "input": 0,
    "output": 0,
    "cached": 0,
    "history": []
  }
}
```

**操作接口**（基于 `useChat` 的方法 + 扩展）

```typescript
{
  // 直接使用 useChat 的方法
  (sendMessage, // 来自 useChat.sendMessage
    setMessages, // 来自 useChat.setMessages
    regenerate, // 来自 useChat.regenerate
    stop, // 来自 useChat.stop
    addToolResult, // 来自 useChat.addToolResult
    addToolOutput, // 来自 useChat.addToolOutput
    clearError, // 来自 useChat.clearError
    // 扩展的业务操作
    resendMessage, // 基于 setMessages + sendMessage
    deleteMessage, // 基于 setMessages
    createSession, // 业务逻辑
    loadSession, // 业务逻辑
    updateSession, // 业务逻辑
    setInput, // UI状态
    setThinking, // UI状态
    resetTokenUsage); // Token统计
}
```

**实现要点**：

1. **直接使用 `useChat`**：在 `ChatProvider` 中调用 `useChat`
2. **状态映射**：将 `useChat` 的状态映射到 Context 状态
3. **方法封装**：直接暴露 `useChat` 的方法，或封装后暴露
4. **扩展功能**：只添加 `useChat` 未提供的功能（如 Token 统计、会话管理）

---

## 后端架构设计

### API 路由层

#### `/api/chat` 路由

**POST 方法** - 处理消息发送和AI回复

**职责**：

- 接收前端发送的消息
- 管理会话（自动创建或获取）
- 保存用户消息到数据库
- 调用 Agent 生成回复
- 创建流式响应
- 保存完成的消息和 Token 使用信息

**处理流程**：

```text
接收请求 (body: { id, message })
  ↓
验证请求格式
  ↓
获取或创建会话 (chatSessionQueries.getSession/createSession)
  ↓
保存用户消息 (chatSessionQueries.saveMessages)
  ↓
加载历史消息 (chatSessionQueries.getSessionMessages)
  ↓
调用 Agent (createAgentUIStreamResponse)
  ↓
流式返回响应
  ↓
onFinish: 保存完成的消息和 Token 信息
```

**关键功能**：

- 会话自动创建：如果会话不存在，根据用户消息自动生成标题
- 消息持久化：用户消息立即保存，AI回复在完成后保存
- Token 统计：从消息 metadata 中提取 Token 使用信息
- 流式响应：使用 `createAgentUIStreamResponse` 创建流式响应

**GET 方法** - 获取会话消息

**职责**：

- 根据 sessionId 获取历史消息
- 返回格式化的消息列表

**处理流程**：

```text
接收请求 (?sessionId=xxx)
  ↓
验证 sessionId
  ↓
查询消息 (chatSessionQueries.getSessionMessages)
  ↓
返回消息列表 (JSON格式)
```

### Agent 层

#### taskAssistantAgent

**类型**：`ToolLoopAgent` (来自 ai-sdk)

**职责**：

- 处理用户消息
- 调用工具执行任务
- 生成AI回复
- 管理工具调用循环

**配置**：

- **模型**：DeepSeek Chat
- **工具集**：bash、read、write、grep、glob、ls、任务管理工具、human-in-loop 等
- **指令**：WBS规划师的系统提示词

**工具调用**：

- 自动工具：bash、read、write 等系统工具自动执行
- 人机交互工具：human-in-loop 需要用户确认
- 任务管理工具：创建、更新、查询任务

### 数据库层

#### 会话管理 (chatSessionQueries)

**功能**：

- `createSession` - 创建新会话
- `getSession` - 获取会话信息
- `getSessionList` - 获取会话列表（带消息统计）
- `getSessionMessages` - 获取会话的所有消息
- `saveMessages` - 保存或更新消息（upsert）

**消息序列化/反序列化**：

- `serializeUIMessage` - 将 UIMessage 转换为数据库格式
  - 提取 `createdAt` 和 `previousMessageId` 到独立字段
  - 序列化 `parts` 数组
  - 保存 `metadata` 到 `meta` 字段

- `hydrateUIMessage` - 将数据库格式转换为 UIMessage
  - 恢复 `parts` 数组
  - 合并 `meta`、`previousMessageId`、`createdAt` 到 `metadata`
  - 映射角色类型

**数据模型**：

- `ChatSession` - 会话表（id, title, createdAt, updatedAt）
- `ChatMessage` - 消息表（id, sessionId, role, previousMessageId, meta, createdAt）
- `ChatMessagePart` - 消息部分表（id, messageId, index, type, state, uiState）

### 数据流设计

#### 完整消息发送流程

```text
前端: useChat.sendMessage
  ↓
API: POST /api/chat
  ↓
1. 验证请求 (body.id, body.message)
  ↓
2. 会话管理
   - 查询会话 (getSession)
   - 不存在则创建 (createSession + 生成标题)
  ↓
3. 保存用户消息
   - serializeUIMessage (序列化)
   - saveMessages (保存到数据库)
  ↓
4. 加载历史消息
   - getSessionMessages (获取所有历史消息)
   - hydrateUIMessage (反序列化)
  ↓
5. 调用 Agent
   - createAgentUIStreamResponse
   - 传入历史消息和 Agent
   - 开始流式生成
  ↓
6. 流式响应
   - 实时返回生成的内容
   - 前端 useChat 自动处理流式更新
  ↓
7. 完成回调 (onFinish)
   - 提取 Token 使用信息 (从 metadata)
   - 保存完成的消息 (saveMessages)
   - 记录日志
```

#### 消息加载流程

```text
前端: GET /api/chat?sessionId=xxx
  ↓
API: 验证 sessionId
  ↓
数据库: getSessionMessages
  ↓
序列化: hydrateUIMessage (转换为 UIMessage)
  ↓
返回: JSON格式的消息列表
  ↓
前端: useChat.setMessages (更新消息列表)
```

#### 工具调用流程

```text
Agent 决定调用工具
  ↓
createAgentUIStreamResponse 处理工具调用
  ↓
自动工具: 直接执行，返回结果
  ↓
人机交互工具: 暂停，等待用户输入
  ↓
前端: 渲染工具UI (HumanInLoopTool)
  ↓
用户交互: 提交结果
  ↓
前端: useChat.addToolResult (提交工具结果)
  ↓
API: 继续 Agent 处理
  ↓
Agent: 基于工具结果继续生成回复
```

### 关键设计要点

1. **消息持久化策略**：
   - 用户消息：立即保存，确保不丢失
   - AI回复：流式生成完成后保存
   - 使用 upsert 模式，支持消息更新

2. **会话管理**：
   - 自动创建会话（首次消息时）
   - 自动生成会话标题（基于用户第一条消息）
   - 支持会话列表查询（带消息统计）

3. **Token 统计**：
   - 从 Agent 返回的 metadata 中提取
   - 保存到消息的 metadata 中
   - 前端从消息 metadata 中读取统计

4. **流式响应**：
   - 使用 `createAgentUIStreamResponse` 创建
   - 支持工具调用的暂停和恢复
   - 前端 `useChat` 自动处理流式更新

5. **错误处理**：
   - API 层统一错误处理
   - 数据库操作错误捕获和日志记录
   - 流式响应错误通过 onError 回调处理

---

## 数据流设计

### 发送消息流程

```text
用户输入 → ChatInputPanel.onSubmit
  → ChatContext.sendMessage (封装 useChat.sendMessage)
  → useChat.sendMessage (ai-sdk)
  → API调用 → 流式响应
  → useChat 自动更新 messages
  → Context 同步状态
  → MessageList重新渲染
```

**关键点**：`useChat` 自动处理流式响应和消息更新，无需手动管理。

### 加载会话流程

```text
会话切换 → useSession.loadSession
  → Repository获取消息
  → useChat.setMessages (更新消息列表)
  → Context 同步状态
  → MessageList渲染
```

**关键点**：使用 `useChat.setMessages` 更新消息，`useChat` 会自动处理状态同步。

### 工具调用流程

```text
AI工具调用 → useChat 自动处理 (onToolCall回调)
  → useToolHandling.handleToolCall
  → 渲染工具UI (HumanInLoopTool)
  → 用户交互
  → useChat.addToolResult (提交工具结果)
  → useChat 自动继续AI对话
```

**关键点**：`useChat` 提供 `addToolResult`、`addToolOutput` 等方法，自动处理工具调用流程。

---

## 文件结构

```text
src/
├── components/chat/
│   ├── ChatInterface.tsx          # 主容器
│   ├── ChatScrollArea.tsx          # 滚动容器
│   ├── MessageComponents/
│   │   ├── MessageList.tsx        # 消息列表
│   │   ├── MessageItem.tsx        # 消息项
│   │   ├── UserMessage.tsx        # 用户消息
│   │   ├── AIMessage.tsx          # AI消息
│   │   ├── MessageContent.tsx     # 消息内容
│   │   ├── MessageActions.tsx     # 消息操作
│   │   ├── ToolCallDisplay.tsx    # 工具调用
│   │   ├── ThinkingIndicator.tsx  # 思考指示
│   │   ├── WelcomeMessage.tsx     # 欢迎消息
│   │   └── ErrorMessage.tsx       # 错误消息
│   ├── InputComponents/
│   │   ├── ChatInputPanel.tsx     # 输入面板
│   │   ├── ChatTextarea.tsx       # 输入框
│   │   └── ChatActions.tsx        # 操作按钮
│   └── tools/
│       └── HumanInLoopTool.tsx    # 人机交互工具
│
├── contexts/chat/
│   ├── ChatContext.tsx            # 上下文定义
│   ├── ChatProvider.tsx           # Provider组件
│   └── types.ts                    # 类型定义
│
├── hooks/chat/
│   ├── useChat.ts                  # 主Hook
│   ├── useChatState.ts             # 状态Hook
│   ├── useChatActions.ts           # 操作Hook
│   ├── useSession.ts               # 会话Hook
│   ├── useMessages.ts              # 消息Hook
│   ├── useSendMessage.ts            # 发送Hook
│   ├── useResendMessage.ts         # 重发Hook
│   ├── useToolHandling.ts          # 工具Hook
│   ├── useAutoScroll.ts            # 滚动Hook
│   ├── useMessageLoading.ts        # 加载Hook
│   ├── useTokenTracking.ts         # TokenHook
│   └── useClipboard.ts             # 剪贴板Hook
│
└── services/chat/
    ├── ChatService.ts               # 聊天服务
    ├── MessageService.ts            # 消息服务
    └── SessionService.ts            # 会话服务
```

---

## 设计原则

### 组件设计

1. **单一职责** - 每个组件只负责一个功能
2. **纯展示** - 展示组件不包含业务逻辑
3. **Props驱动** - 通过Props传递数据和回调
4. **可复用** - 组件设计考虑复用性

### Hook设计

1. **充分利用 ai-sdk** - 直接使用 `useChat` 提供的功能，不重复实现
2. **功能聚焦** - 每个Hook只处理一个功能域
3. **状态分离** - 基于 `useChat` 的状态，只添加必要的扩展状态
4. **副作用隔离** - 副作用Hook独立管理，监听 `useChat` 的状态变化
5. **易于测试** - Hook逻辑可独立测试，`useChat` 可 mock

### 状态管理

1. **基于 useChat** - Context 内部使用 `useChat`，状态主要来自 `useChat`
2. **集中管理** - 通过Context统一管理扩展状态和业务逻辑
3. **不可变更新** - `useChat` 自动处理状态更新，扩展状态使用不可变模式
4. **类型安全** - 充分利用TypeScript类型，`useChat` 提供完整类型
5. **性能优化** - `useChat` 已优化，合理使用useMemo和useCallback处理扩展逻辑

---

## 实施建议

### 阶段一：基础架构

1. **创建ChatContext和ChatProvider**
   - 在 `ChatProvider` 中调用 `useChat`
   - 将 `useChat` 的状态和方法暴露到 Context
   - 添加扩展状态（会话、Token等）

2. **实现核心状态管理**
   - 基于 `useChat` 的状态
   - 添加业务逻辑层

3. **重构主要组件**
   - 组件通过 `useChat` Hook 访问状态
   - 使用 `useChat` 提供的方法

### 阶段二：功能完善

1. 实现所有Hook
2. 完善组件功能
3. 优化用户体验

### 阶段三：优化测试

1. 性能优化
2. 测试覆盖
3. 文档完善
