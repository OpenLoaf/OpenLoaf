---
name: multi-agent-routing
description: >
  多 Agent 对话路由架构。包含三层指挥链（Secretary → PM → Specialist）的
  角色分工、路由判定规则、记忆体系设计，以及 @agents/ 前端触发、服务端路由、
  task-report 回报的完整实现细节。
version: 2.1.0
---

# 多 Agent 对话路由架构

> OpenLoaf AI Agent 团队体系：用户 → 秘书（Secretary）→ 项目管理员（PM）→ 专家（Specialist）三层指挥链。

---

## 一、架构总览：三层指挥链

```
用户
 │
 ├── 对话 ──→ AI 秘书（Secretary / Master Agent）
 │              │
 │              ├── 直接回答（不产生文件的事）
 │              │
 │              ├── 创建/进入项目 ──→ Project Manager Agent
 │              │                      │
 │              │                      ├── 自己处理简单的项目管理事务
 │              │                      │
 │              │                      └── 分配任务 ──→ Specialist Agent(s)
 │              │                                        │
 │              │                                        └── 执行 → 汇报 → PM 验收
 │              │
 │              └── 创建定时/条件触发任务（不属于任何项目的也行）
 │
 └── @mention ──→ 直接和某个 Agent 对话（PM 或 Specialist）
```

## 二、角色定义

| 角色 | 数量 | 生命周期 | 核心职责 |
|------|------|----------|----------|
| **Secretary** (Master) | 每个对话 1 个 | 对话期间存在 | 理解用户意图、判断直接做还是派活、创建项目、调度 PM |
| **Project Manager** | 每个项目 1 个 | 项目存在即存在 | 管理项目内所有工作、分解任务、分配 Specialist、验收成果、维护项目记忆 |
| **Specialist** | 按需创建 | 任务期间存在，经验保留 | 执行具体工作（写代码、写文档、审查、测试等） |

## 三、秘书路由判定规则

秘书（Secretary / Master Agent）收到用户消息后，核心判断：**直接做 vs 派活**。

### 直接做 = 不产生持久产物的事情

- 回答问题、翻译、解释、计算
- 读文件、查数据、搜索信息
- 简单的一步操作（创建一个日历事件、发一封邮件）
- 闲聊、建议、决策辅助

### 派活 = 产生文件/成果物、或需要多步规划的事情

- 写文档、写代码、生成报告
- 审查代码、重构模块
- 任何涉及"创建/修改文件"的工作
- 复杂的多步骤任务

### 灰色地带原则

> **秘书可以"看"（读取、分析），但不应该"做"（创建、修改文件）。一旦涉及到"做"，就应该进入项目 → PM 接手。**

## 四、关键流程示例

### 流程 1：需要产出文件（如"帮我写一个产品方案"）

1. 秘书判断 → 需要产出文件 → 需要项目
2. 秘书创建临时项目 → 自动生成 PM
3. PM 分析需求 → 分解为子任务（市场调研、竞品分析、方案撰写）
4. PM 分配 Specialist（Research Agent 做调研、Document Writer 写方案）
5. Specialist 各自执行 → 向 PM 汇报
6. PM 验收整合 → 向秘书汇报 → 秘书告诉用户

### 流程 2：不产生文件（如"翻译这段话"）

1. 秘书判断 → 不产生文件 → 直接做
2. 秘书翻译 → 回复用户

### 流程 3：PM 发现需要额外资源

1. PM 发现需要设计图 → 向秘书请求 Designer Agent
2. 或者 PM 直接联系关联项目的 PM（跨项目协作）

## 五、Prompt 继承链

```
用户偏好（秘书记忆）
 ↓ 继承
Secretary Prompt = 思维框架 + 用户偏好 + 任务委派能力
 ↓ 继承基础性格 + 用户偏好
PM Prompt = 基础性格 + 项目管理职责 + 项目记忆 + 项目上下文
 ↓ 继承项目上下文
Specialist Prompt = Agent 角色定义（.md 文件）+ 项目上下文 + 任务指令 + 自身经验记忆
```

## 六、三层记忆体系

所有记忆都带时间衰减。

| 层级 | 记住什么 | 存在哪里 | 衰减规则 |
|------|----------|----------|----------|
| **秘书记忆** | 用户偏好、沟通风格、常用项目 | 用户级存储 | 高频强化，低频衰减 |
| **PM 记忆** | 项目技术栈、架构决策、团队经验 | 项目级存储 | 项目活跃时强化，闲置时衰减 |
| **Specialist 记忆** | 执行经验、踩过的坑、最佳实践 | Agent 角色级存储 | 被调用时强化，长期不用衰减 |

### 衰减模型

- 每条记忆有 `lastAccessedAt` + `accessCount`
- 权重 = `accessCount × recency_factor`
- 上下文窗口有限时，按权重排序截取
- 定期清理极低权重记忆

## 七、Agent 角色管理

- 用户通过 `.md` 文件定义 Agent 角色（格式兼容 agency-agents）
- 系统提供角色模板库（用户可一键导入 Coder、Writer、Reviewer 等）
- 角色文件存储在 `~/.agents/agents/` 或项目级 `.agents/agents/`
- PM 根据任务需求自动选择合适的 Specialist 角色
- 如果没有匹配角色 → PM 使用通用 Agent 执行

## 八、项目即容器

- 所有产生文件的工作都在项目内进行
- 没有项目 → 秘书自动创建临时项目
- 临时项目可以被用户提升为永久项目
- 每个项目自动拥有一个 PM
- 项目是 Agent 工作的边界和上下文

---

# 实现细节

> 以下为当前代码层面的实现细节：`@agents/项目/管理员` 路由系统。

## 核心数据流

### 模式 A：项目内直聊（PM 直聊模式）

当用户在项目对话中直接输入消息（session 有 projectId）：

```
用户在项目 X 的对话中输入消息
    ↓ 前端 Chat.tsx 设置 requestParams: { projectId, agentType: 'pm' }
    ↓ SSE 请求发送到服务端

服务端 chatStreamService 检测到 params.agentType === 'pm'
    ↓ createPMAgentRunner() 创建 PM Agent
    ↓ PM Agent 以流式方式直接回复用户
    ↓ PM 可通过 spawn-agent 工具创建子任务（自主决定）
```

**关键**：项目内对话 = PM 直接流式回复，不走任务创建流程。PM 自己决定何时需要创建子任务。

### 模式 B：跨项目 @mention 路由（任务模式）

当用户从主对话（或其他项目对话）@mention 另一个项目的 PM：

```
用户在主对话输入 "@agents/项目X/pm 做个需求分析"
    ↓ 前端 ChatAgentMention 解析出 selectedAgent: {projectId, projectTitle, agentType:'pm'}
    ↓ ChatInput.handleSubmit() 判断 selectedAgent.projectId !== 当前 projectId（跨项目）
    ↓ 注入 metadata.targetAgent: {kind:'pm', projectId, projectTitle}
    ↓ SSE 请求发送到服务端

服务端 chatStreamService 检测到 metadata.targetAgent 且 targetAgent.projectId !== session.projectId
    ↓ findActivePmTask(projectId) 查找活跃 PM 任务
    ├─ 无活跃任务 → createTaskConfig() 创建新 PM 任务
    │   ↓ TaskOrchestrator 调度执行
    │   ↓ PM 在独立 session (task-{taskId}-{uuid}) 中运行
    │   ↓ 完成后 → reportToSourceSession() → task-report 消息写入主对话
    │   ↓ TaskEventBus → onSessionUpdate → 前端实时收到
    │
    └─ 有活跃任务 → updateTask() 追加消息
        ↓ PM 继续执行，完成后同样 report 回来

服务端返回 createAgentRouteAckResponse()
    ↓ 轻量确认消息："已将指令发送给「项目X」的管理员，稍后会在此回报结果。"
    ↓ 不触发主 Agent（master），直接返回 SSE 流
```

### 路由决策总结

| 场景 | agentType | targetAgent | 走哪条路 | 响应方式 |
|------|-----------|-------------|---------|---------|
| 项目内直接对话 | `'pm'` | 无 | PM Agent 直聊 | 流式 |
| 项目内 @mention 同项目 PM | `'pm'` | 被忽略（同项目） | PM Agent 直聊 | 流式 |
| 主对话 @mention 某项目 PM | 无 | `{kind:'pm', projectId}` | 任务创建/追加 | ACK + task-report |
| 项目 A @mention 项目 B PM | `'pm'` | `{kind:'pm', projectId:B}` | 任务创建/追加 | ACK + task-report |
| 主对话无 mention | 无 | 无 | Master Agent | 流式 |

## 类型定义

### TargetAgent（`packages/api/src/types/message.ts`）

```typescript
export type TargetAgent = {
  kind: 'pm'
  projectId: string
  projectTitle?: string
}
```

### SelectedAgent（`ChatAgentMention.tsx`）

```typescript
export type SelectedAgent = {
  projectId: string
  projectTitle: string
  agentType: 'pm'
}
```

## 前端：@ Mention 触发与选择

### ChatAgentMention 组件

**文件**：`apps/web/src/components/ai/input/ChatAgentMention.tsx`

**触发规则**：
- 正则 `/(^|\s)@(\S*)$/u` — 用户输入 `@` 即触发（不需要输入 `@agents/`）
- `@` 后的文本作为项目名搜索关键词，模糊匹配 `useProjects()` 返回的项目列表
- 菜单固定宽度 280px，最大高度 320px

**数据源**：
- `useProjects()` hook（`apps/web/src/hooks/use-projects.ts`）
- 每个项目映射为 `MentionItem`：`{ id: projectId, label: project.title, icon: project.icon, projectId, agentType: 'pm' }`

**定位方式**：
- 隐藏 `<span ref={menuRef}>` 锚点 + `closest(".openloaf-thinking-border")` 查找父容器
- 计算 `{ left: rect.left, bottom: window.innerHeight - rect.top + GAP }` 固定定位
- 与 `ChatCommandMenu` 共用相同的定位模式

**选择行为**：
- 选中后文本替换为 `@agents/项目名/pm `（注意末尾空格）
- 通过 `onAgentSelect(selectedAgent)` 回调传递给 ChatInput
- 支持 ArrowUp/Down 导航、Tab/Enter 选择、Escape 取消

### ChatInput 集成

**文件**：`apps/web/src/components/ai/input/ChatInput.tsx`

**状态管理**：
- 外层 `ChatInput` 组件维护 `selectedAgent` state
- 通过 `onAgentSelect` prop 传递给内层 `ChatInputBox`

**handleSubmit 逻辑**：
1. 如果 `selectedAgent` 存在：
   - 从文本中剥离 `@agents/.../pm` 前缀（正则 `/^@agents\/\S+\/pm\s*/u`）
   - **跨项目判定**：`isCrossProject = selectedAgent.projectId !== projectId`
   - 仅当 `isCrossProject` 为 true 时，注入 `metadata.targetAgent: { kind: 'pm', projectId, projectTitle }`
   - 同项目 mention 不注入 targetAgent（消息直接走 PM 直聊模式）
2. 发送后清空 `selectedAgent`

### Chat 组件 requestParams

**文件**：`apps/web/src/components/ai/Chat.tsx`

当 session 关联到项目（`projectId` 存在）时，自动设置 `agentType: 'pm'`：
```typescript
const requestParams = useMemo(() => {
  const nextParams = { ...rawParams };
  if (projectId) {
    nextParams.projectId = projectId;
    nextParams.agentType = 'pm'; // 项目对话 = PM 直聊
  }
  return nextParams;
}, [rawParams, projectId]);
```

这使得项目内所有消息自动走 PM Agent 流式路径，无需用户手动 @mention。

## 前端：Agent Chip 渲染

### ChatInputEditor 中的 Chip

**文件**：`apps/web/src/components/ai/input/ChatInputEditor.tsx`

**渲染规则**：
- `valueToHtml()` 正则匹配 `@agents/([^/\s]+)/pm` 并转换为 chip HTML
- Agent chip 使用 `ol-agent-chip` class + **内联样式**（不依赖 CSS class）
- 颜色方案：琥珀色（`background: rgba(254,243,199,0.8); color: #b45309`）
- 图标：lucide Users SVG 内联
- 显示文本：`{项目名}/管理员`

**Chip HTML 结构**：
```html
<span class="ol-agent-chip" data-token="@agents/项目/pm" contenteditable="false"
  style="display:inline-flex;align-items:center;gap:3px;...;background:rgba(254,243,199,0.8);color:#b45309">
  <svg>...</svg>
  <span style="overflow:hidden;text-overflow:ellipsis">项目名/管理员</span>
</span>
```

**关键设计决策**：
- 使用内联样式而非 CSS class — 解决 HMR 导致 `<style>` 标签丢失的问题
- `ensureStyles()` 使用 ID-based `<style>` 标签（`id="ol-chip-styles"`）+ 清理无 ID 的旧标签
- `domToValue()` 和 `isEmpty()` 需识别 `AGENT_CHIP_CLASS` 以正确处理反序列化

**valueToHtml 正则**（合并匹配 @mention、/skill、@agents）：
```typescript
/@\{([^}]+)\}|\/skill\/([\w-]+)(?=\s|[^\x00-\x7F])|@agents\/([^/\s]+)\/pm(?=\s|$)/g
```

## 服务端：路由逻辑

### chatStreamService 路由

**文件**：`apps/server/src/ai/services/chat/chatStreamService.ts`

**路由入口**：在 `startChatStream()` 函数中，两层路由判定：

**第一层：跨项目 targetAgent 路由**（任务模式）
```typescript
const targetAgent = (lastMessage as any)?.metadata?.targetAgent as TargetAgent | undefined

// 只有跨项目 mention 才走任务路由
const isCrossProjectMention = targetAgent?.kind === 'pm'
  && targetAgent.projectId
  && targetAgent.projectId !== projectId; // projectId = 当前 session 的项目

if (isCrossProjectMention) {
  // 1. 提取纯文本
  // 2. findActivePmTask() 查找活跃任务
  // 3. 有则 appendUserMessage()，无则 createTaskConfig()
  // 4. 返回 createAgentRouteAckResponse()（不触发 master agent）
}
```

**第二层：agentType 参数路由**（直聊模式）
```typescript
const agentType = input.request.params?.agentType;
if (agentType === 'pm') {
  // PM Agent 直接流式回复（项目内对话走这里）
  masterAgent = createPMAgentRunner({ model, modelInfo, taskId, projectId });
} else if (agentType === 'project') {
  masterAgent = createProjectAgentRunner({ model, modelInfo, taskId });
} else {
  masterAgent = createMasterAgentRunner({ model, modelInfo, instructions });
}
```

**关键**：同项目的 `targetAgent` 会被忽略（前端不注入 + 后端跳过），消息直接走 `agentType: 'pm'` 路径。

### findActivePmTask

**文件**：`apps/server/src/services/taskConfigService.ts`

```typescript
export function findActivePmTask(
  projectId: string,
  globalRoot: string,
  projectRoots?: string | string[] | null
): TaskConfig | null
```

**查找逻辑**：
1. `listTasksByStatus('running')` → 过滤 `agentName === 'pm' && projectId === targetProjectId`
2. 如有多个 running，取最新（按 `createdAt` 排序）
3. 无 running 则查 `status === 'todo'`（排队中）
4. 均无则返回 `null`

### createAgentRouteAckResponse

**文件**：`apps/server/src/ai/services/chat/streamOrchestrator.ts`

轻量确认响应，不触发主 Agent：
1. 保存 assistant 消息到主 session
2. 返回 SSE 流：`start → text-start → text-delta → text-end → finish`
3. 确认文本：`已将指令发送给「{项目名}」的管理员，稍后会在此回报结果。`

## 关键文件索引

| 用途 | 文件路径 | 角色 |
|------|---------|------|
| @ Mention UI | `apps/web/src/components/ai/input/ChatAgentMention.tsx` | 项目选择菜单 |
| 项目聊天参数 | `apps/web/src/components/ai/Chat.tsx` | agentType:'pm' 注入 |
| 消息提交 | `apps/web/src/components/ai/input/ChatInput.tsx` | 跨项目 metadata 注入 |
| Chip 渲染 | `apps/web/src/components/ai/input/ChatInputEditor.tsx` | valueToHtml/domToValue |
| 项目列表 | `apps/web/src/hooks/use-projects.ts` | useProjects() hook |
| 类型定义 | `packages/api/src/types/message.ts` | TargetAgent 类型 |
| 流路由 | `apps/server/src/ai/services/chat/chatStreamService.ts` | targetAgent 路由 |
| 确认响应 | `apps/server/src/ai/services/chat/streamOrchestrator.ts` | createAgentRouteAckResponse |
| 任务查找 | `apps/server/src/services/taskConfigService.ts` | findActivePmTask |
| 任务执行 | `apps/server/src/services/taskExecutor.ts` | PM 任务运行 |
| 事件总线 | `apps/server/src/services/taskEventBus.ts` | task-report 事件 |
| Agent 工厂 | `apps/server/src/ai/services/agentFactory.ts` | PM agent 创建 |
| Task Report UI | `apps/web/src/components/ai/message/MessageTaskReport.tsx` | 任务报告渲染 |
| Agent 模板 | `apps/server/src/ai/agent-templates/templates/` | master/pm/specialist prompt |

## Skill Sync Policy（强制）

> **硬性规则**：修改下列任何文件中与多 Agent 路由相关的逻辑后，**必须在同一次提交中同步更新本 skill 文件**。不允许只改代码不更新文档。提交前检查 diff 是否涉及下列文件，如涉及则打开本文件确认内容是否仍然准确。

| 变更范围 | 需更新的 skill 章节 |
|----------|-------------------|
| `ChatAgentMention.tsx` 触发正则、数据源、选择逻辑 | 前端：@ Mention 触发与选择 |
| `Chat.tsx` requestParams / agentType 设置 | 前端：Chat 组件 requestParams |
| `ChatInput.tsx` handleSubmit / selectedAgent / 跨项目判定 / metadata 注入 | 前端：@ Mention 触发与选择 → ChatInput 集成 |
| `ChatInputEditor.tsx` valueToHtml/domToValue 正则、chip 样式、ensureStyles | 前端：Agent Chip 渲染 |
| `chatStreamService.ts` targetAgent 路由、任务创建/追加逻辑 | 服务端：路由逻辑 → chatStreamService 路由 |
| `streamOrchestrator.ts` createAgentRouteAckResponse 格式或行为 | 服务端：路由逻辑 → createAgentRouteAckResponse |
| `taskConfigService.ts` findActivePmTask 查找策略 | 服务端：路由逻辑 → findActivePmTask |
| `message.ts` TargetAgent / SelectedAgent 类型定义 | 类型定义 |
| `taskExecutor.ts` / `taskEventBus.ts` PM 任务执行或 report 机制 | 核心数据流 + 关键文件索引 |
| `MessageTaskReport.tsx` task-report 渲染逻辑 | 关键文件索引 |
| 新增 agent 类型（非 pm） | 全文档（数据流、类型、路由、chip 等） |
| 架构层级变更（新增/删除角色层） | 一～八章架构设计部分 |

**同步规则**：
1. 代码变更后，逐条对照上表，确认受影响章节的描述仍然正确
2. 如果新增了文件或删除了文件，同步更新「关键文件索引」表
3. 如果数据流发生变化（如新增路由分支），同步更新「核心数据流」图
4. 如果类型签名变更，同步更新「类型定义」章节中的代码片段
5. 如果架构设计发生变化（角色、路由规则、记忆体系），同步更新对应的架构章节
