

### Step 4: 绑定到能力组（Capability Groups）

如需系统 Agent 默认拥有此工具，在 `apps/server/src/ai/shared/systemAgentDefinitions.ts`
把对应能力组 ID 加入 `capabilities`。

### Step 5: 前端渲染（可选）

大部分工具自动使用 `UnifiedTool` 通用卡片。如需自定义渲染，在 `message/tools/MessageTool.tsx` 添加路由分支。

示例：`chart-render` 工具使用自定义 `ChartTool` 在消息列表内嵌图表。

## 新工具开发教程（详细版）

> 目标：给“从 0 添加工具”一个可执行的完整路径（含前端执行、审批、UI 事件控制）。

### 0) 先判断工具类型

- **纯后端工具**：只在 server 执行，返回结果 → 走 Step 1~4
- **前端执行工具**：需要前端做 UI/系统操作并回执 → 走 Step 1~5
- **控制类工具（UI Event）**：只改变 UI 状态（打开面板/关闭 overlay/刷新）→ 走 Step 1~4 + Step 6

### 1) 定义 ToolDef（唯一事实来源）

位置：`packages/api/src/types/tools/<domain>.ts`

**必填字段：**
- `id` / `name` / `description`
- `parameters`（zod）
- `component: null`
- 需要审批时增加 `needsApproval: true`

**约定：**
- 业务侧不手写工具 ID，统一引用 `xxxToolDef.id`
- `actionName` 必须作为参数字段，用于 LLM 说明调用目的
- 新文件需在 `packages/api/src/types/tools/index.ts` 导出
- 如果是 System 工具，补齐 `systemToolMeta` 的风险分级（`RiskType`）

### 2) 后端实现（server tool）

位置：`apps/server/src/ai/tools/<toolName>.ts`

**关键点：**
- 使用 `tool()` + `zodSchema(xxxToolDef.parameters)`
- `description` 必须来自 `xxxToolDef.description`
- 需要审批时，在 `tool()` 中设置 `needsApproval`（可为 boolean 或 function）
- 需要 session/tab 上下文时通过 `requestContext` getter 或辅助函数读取

示例补充：
- `video-download` 属于纯后端工具：定义在 `packages/api/src/types/tools/videoDownload.ts`，实现位于 `apps/server/src/ai/tools/videoDownloadTool.ts`，内部复用已有媒体模块 `videoDownloadService.ts`

### 3) 注册 & 授权范围

**注册表**：`apps/server/src/ai/tools/toolRegistry.ts`

**能力组 & Agent 可用工具**：
- 能力组映射：`apps/server/src/ai/tools/capabilityGroups.ts`（把工具加入对应能力组）
- 系统 Agent 默认能力：`apps/server/src/ai/shared/systemAgentDefinitions.ts` → `capabilities`
- 子代理：各自文件内的工具集（仅暴露必要工具）

### 4) 前端渲染（可选）

- 默认走 `UnifiedTool`（无需额外操作）
- 自定义 UI：在 `apps/web/src/components/chat/message/tools/` 新建卡片组件，并在 `MessageTool.tsx` 添加路由分支

## JSX Preview 文件刷新模式

- `jsx-create` 工具写入 `.openloaf/chat-history/<sessionId>/jsx/<messageId>.jsx` 并返回路径
- `apply-patch` 修改该文件后，`WriteFileTool` 触发刷新事件
- `JsxCreateTool` 监听事件并 `invalidateQueries` 重新读取

### 5) 前端执行工具（需要 Ack）

**后端：**
- `execute` 内调用 `registerFrontendToolPending({ toolCallId, timeoutSec })`
- 前端执行类工具必须 `requireTabId()`（否则无法定位 UI）
- 超时/失败需要返回明确错误，避免卡住循环

**前端：**
- `apps/web/src/lib/chat/frontend-tool-executor.ts`
  - 在 `registerDefaultFrontendToolHandlers()` 中注册 handler
  - handler 返回 `{ status, output, errorText? }`
  - executor 会自动 `POST /ai/tools/ack`

**后端回执路由：**
`apps/server/src/ai/interface/routes/frontendToolAckRoutes.ts`（通常无需改动）

### 6) 控制类工具（UI Event）

**适用场景：** 只需要改变 UI 状态（打开/关闭面板、刷新树、切换视图）

**必做清单：**
1. `packages/api/src/types/event.ts`
   - 增加 `UiEventKind`
   - 扩展 `UiEvent` 联合类型
   - 在 `uiEvents` 工厂补齐生成函数
   - 在 `uiEventSchema` 补齐 zod 校验
2. `apps/web/src/lib/chat/uiEvent.ts`
   - 在 handlers 分发表中新增处理逻辑
3. `apps/web/src/components/Providers.tsx`
   - 确保监听 `openloaf:ui-event` 并分发到 `handleUiEvent`

**IPC 入口约定（新增或改造时）：**
- 任何 Electron IPC 入口/桥接/监听文件命名必须以 `*ElectronIpc` 结尾
- `handleUiEvent` 保持传输层无关，仅负责应用 UI 状态

**注意：**
- 不要通过 SSE custom data 下发 UI 事件
- UI 控制不做“历史重放”，需要重做就重新调用工具

### 7) 快速自检清单

- ToolDef 已导出、`id` 唯一、`component: null`
- toolRegistry 已注册，能力组 / 系统 Agent 能力已更新
- 需要审批的工具：ToolDef 和 tool() 都设置 `needsApproval`
- 前端执行工具：pendingRegistry + executor handler 已补齐
- 控制类工具：UiEvent kind + handlers + IPC 入口齐全
- 最后跑一次 `pnpm check-types`

## Adding a New Sub-Agent

子代理通过 `agentFactory.ts` 数据驱动创建，使用 `agent-templates` 管理模板。

### Step 4: 在 agentFactory 中添加创建分支

在 `services/agentFactory.ts` 的 `resolveAgentType()` 或创建分支中处理新 Agent 类型。

### 子代理存储

子代理自动使用统一存储，无需额外配置：
- `agentManager.ts` 调用 `saveAgentMessage()` 持久化每条消息
- `writeAgentSessionJson()` 写入 agent 元数据
- 存储路径：`<session>/agents/<agentId>/messages.jsonl` + `session.json`
- F5 刷新后通过 `getSubAgentHistory` tRPC 路由恢复历史

## Modifying Agent Prompt

| 修改目标 | 文件 |
|----------|------|
| Master Agent 基础角色 | `agent-templates/templates/master/prompt-v3.zh.md` / `prompt-v3.en.md` |
| 系统 Agent 提示词 | `agent-templates/templates/<agentId>/prompt.zh.md` |
| Session preface（运行时上下文） | `shared/prefaceBuilder.ts` → `buildSessionPrefaceText()` |
| 技能摘要格式 | `shared/promptBuilder.ts` → `buildSkillsSummarySection()` |

## Skills System

技能文件存放在 `.agents/skills/<name>/SKILL.md`，由 `services/skillsLoader.ts` 扫描加载。

**摘要扫描顺序**: global → parent projects → current project

**运行时命中优先级**: current project → parent projects → global

### Skill 名称国际化（originalName / name）

`SkillSummary` 有两个名称字段：
- `originalName`: SKILL.md front-matter 中的原始名称，用于所有**匹配和加载**场景
- `name`: 显示名称，可能被 `openloaf.json` 翻译覆盖，仅用于**用户界面展示**

**数据流**:
```
SKILL.md front-matter name = "ai-test-development"  → originalName（匹配用）
openloaf.json name = "AI 测试开发"                   → name（显示用）
```

**命令格式**:
- 有翻译: `/skill/[ai-test-development|AI 测试开发]` — 方括号内 `|` 前为 originalName，后为 displayName
- 无翻译: `/skill/[ai-test-development]`
- 旧格式（兼容）: `/skill/ai-test-development`

**匹配规则**:
- `SkillSelector.resolveSkillByName()` 先匹配 `originalName`，再 fallback 到 `name`
- `SkillSelector.extractSkillNamesFromText()` 从 `/skill/[xxx|yyy]` 中提取 `xxx`（originalName），同时兼容旧格式 `/skill/name`
- `promptBuilder.buildSkillsSummarySection()` 输出 `originalName` 给 AI 模型，确保 `load-skill` 工具传入原始名
- `skillsLoader.loadSkillSummaries()` 使用 `originalName` 作为去重 key

**前端规则**:
- `ChatCommandMenu` 选择时调用 `buildSkillCommandText(originalName, displayName)`
- `ChatInputEditor` 的 `valueToHtml` 同时支持新旧两种格式，新格式 chip 显示 `displayName`
- `text-tokenizer` 的 `ChatTextToken` skill 类型有 `displayName?` 可选字段
- `SkillsSettingsPanel` 插入命令时传 `originalName` + `displayName`
- `SubAgentChatPanel` 技能勾选使用 `originalName` 匹配
- `openSkillInStack()` 同时匹配 `originalName` 和 `name`

**使用流程**:
1. 用户消息中输入 `/skill/[originalName|displayName]`（或旧格式 `/skill/name`）
2. `SkillSelector.extractSkillNamesFromText()` 解析出 originalName
3. `AiExecuteService` 通过 `resolveSkillByName(originalName)` 加载 SKILL.md 内容
4. 作为 `data-skill` part 注入到用户消息前
5. `messageConverter.ts` 中 `convertDataPart` 转为模型可读文本（`<skill>` 标签包裹）

## Backend-Driven Frontend Actions（前端执行工具）

某些工具需要在前端执行操作（如打开浏览器面板），后端阻塞等待前端回执后继续 AI 循环。以 `open-url` 为典型案例。

### 案例：open-url 工具

**1. 共享类型定义**

**2. 后端工具**（阻塞等待前端回执）

**3. 前端执行器**（自动执行 + 回执）

**4. 前端工具卡片**（消息中的可点击 UI）

### 添加新的前端执行工具

在现有 5 步基础上额外需要：

1. 后端 `execute` 中使用 `registerFrontendToolPending()` 替代直接返回
2. 后端必须调用 `requireTabId()` 确保有 tabId
3. 在 `frontend-tool-executor.ts` 的 `registerDefaultFrontendToolHandlers()` 中注册 handler
4. handler 执行前端操作后返回 `{ status, output, errorText? }`
5. 每个 toolCallId 自动去重（`executed` Set），不会重复执行

### 当前使用此模式的工具

| 工具 | 用途 | 文件 |
|------|------|------|
| `open-url` | 在应用内打开网页浏览器面板 | `tools/openUrl.ts` |
| `sub-agent` (approval) | 子代理审批等待用户确认 | `tools/subAgentTool.ts` |

## SSE 自定义事件模式（非前端执行工具）

某些工具不需要前端执行回执，但需要推送进度/状态事件到前端。通过 `uiWriter` 推送自定义 data 事件，前端在 `ChatCoreProvider` 中监听并更新 `toolParts` 状态。

### 案例：image-generate / video-generate

**后端推送事件：**

**前端监听（ChatCoreProvider.tsx）：**

`handleMediaGenerateDataPart` 函数处理上述事件，更新 `AnyToolPart.mediaGenerate` 字段。

**前端渲染（MediaGenerateTool.tsx）：**

根据 `mediaGenerate.status` 渲染：generating（进度条）→ done（图片缩略图/视频播放器）→ error（登录按钮/错误提示）。

### 添加新的 SSE 自定义事件工具

1. 后端 `execute` 中通过 `getUiWriter()` 推送 `data-xxx-start/progress/end/error` 事件
2. `ChatCoreProvider.tsx` 中添加 `handleXxxDataPart` 函数处理事件
3. `tool-utils.ts` 的 `AnyToolPart` 类型新增对应字段
4. 创建专用渲染组件，在 `UnifiedTool.tsx` 中路由

### 前端
1. **消息检查**: `useChatState().messages` 查看完整消息数组
2. **分支调试**: `useChatSession().siblingNav` 查看兄弟关系
3. **工具流式**: `useChatTools().toolParts` 查看实时工具快照
4. **子代理**: `useChatTools().subAgentStreams` 查看子代理输出
5. **SSE 调试**: 浏览器 Network 面板查看 EventSource 流

### 后端
1. **请求追踪**: `logger` 自动附带 sessionId
2. **工具修复日志**: 搜索 `[tool-repair]` 判断 JSON 修复
3. **消息链**: `resolveMessagePathById` 重建消息链
4. **模型解析**: `resolveChatModel()` 返回 null → 检查 API key 配置
5. **上下文检查**: `getRequestContext()` 返回 undefined → 不在 SSE 上下文中
6. **工具激活问题**: debug 目录 `step*_request.json` 中的 `activeTools` 字段可查看实际发给模型的工具列表；如果模型调用了不在该列表中的工具，说明它幻觉调用了未激活工具 → `applyActivationGuard` 会拦截（详见 ai-backend.md「ToolSearch Pull 模式」）
