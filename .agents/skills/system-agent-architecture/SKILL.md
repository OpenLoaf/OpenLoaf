---
name: System Agent Architecture
description: 系统 Agent 架构设计文档。当涉及系统 Agent 定义、能力组、模型解析、Agent 初始化、spawn 机制、前端 Agent 管理等开发任务时使用此 skill。
version: 1.0.0
---

# 系统 Agent 架构

## 核心原则

1. 每个 Agent 独立配置模型，默认 Auto（主 Agent 在 spawn 时决定用什么模型）
2. 8 个系统 Agent，不可删除，按能力组划分
3. 主 Agent 混合模式：可直接执行简单任务，也可 spawn 其他 Agent
4. 主 Agent 专属 spawn 权限（通过能力组限制自然实现）
5. 自定义 Agent 也可配置模型

## 系统 Agent 列表

| # | 名称 | ID | 能力组 | 说明 |
|---|------|-----|--------|------|
| 1 | 主助手 | master | system + agent + file-read + web + media + code-interpreter | 混合模式，可直接执行也可 spawn |
| 2 | 文档助手 | document | file-read + file-write + project | 文件读写 + 文档分析 + 自动总结 |
| 3 | 终端助手 | shell | shell | Shell 命令执行 |
| 4 | 浏览器助手 | browser | browser + web | 网页浏览和数据拓取 |
| 5 | 邮件助手 | email | email | 邮件查询和操作 |
| 6 | 日历助手 | calendar | calendar | 日历事件管理 |
| 7 | 工作台组件助手 | widget | widget | 动态 Widget 创建 |
| 8 | 项目助手 | project | project | 项目数据查询操作 |

注：图片/视频生成和代码解释器作为工具直接给主 Agent，不单独建 Agent。

## Auto 模型机制

- Agent 模型设为 Auto（默认）→ 不指定固定模型
- 主 Agent spawn 子 Agent 时，根据任务复杂度自行决定传什么 `modelOverride`
- 模型优先级：Agent 自身配置 > modelOverride > Auto（自动选择）
- 实现：`resolveAgentModel()` in `apps/server/src/ai/models/resolveAgentModel.ts`

## 模块依赖图

```
systemAgentDefinitions.ts  (0 imports — 纯数据叶子模块)
  ^
  |--- masterAgentRunner.ts    (派生 MASTER_AGENT_TOOL_IDS)
  |--- agentFactory.ts         (创建子 Agent 时查找定义)
  |--- agentConfigService.ts   (注入 isSystem 标记)
  |--- defaultAgentResolver.ts (初始化系统 Agent 文件夹)

resolveAgentModel.ts  (imports resolveChatModel.ts)
  ^
  |--- agentManager.ts         (为子 Agent 解析模型)

capabilityGroups.ts  (不变，被上述模块引用)
```

## 关键设计决策

1. `systemAgentDefinitions.ts` 零依赖，纯数据常量，所有模块从此派生
2. `isSystem` 是运行时计算的标记（基于 folderName），不持久化到磁盘
3. spawn 权限通过能力组限制自然实现：只有 master 有 `agent` 能力组
4. `masterAgentRunner.ts` 的工具集从 master 定义的 capabilities 派生，不再硬编码工具 ID
5. 不再做 default/main 迁移，默认目录固定为 `master`

## 关键文件

### 数据源

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/shared/systemAgentDefinitions.ts` | 系统 Agent 定义（零依赖数据源） |
| `apps/server/src/ai/models/resolveAgentModel.ts` | Agent 模型解析（优先级链） |
| `apps/server/src/ai/tools/capabilityGroups.ts` | 能力组 → 工具 ID 映射 |

### 初始化 & 迁移

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/shared/defaultAgentResolver.ts` | ensureSystemAgentFiles() |
| `apps/server/src/ai/shared/workspaceAgentInit.ts` | 工作空间初始化入口，调用迁移和创建 |

### Agent 运行时

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/services/masterAgentRunner.ts` | 主 Agent Runner 创建（从 capabilities 派生工具集） |
| `apps/server/src/ai/services/agentFactory.ts` | 数据驱动的子 Agent 创建 |
| `apps/server/src/ai/services/agentManager.ts` | Agent 生命周期管理、spawn 调度、消息持久化 |
| `apps/server/src/ai/services/agentConfigService.ts` | Agent 配置读取、isSystem 标记 |
| `apps/server/src/ai/services/skillsLoader.ts` | 技能文件扫描加载 |
| `apps/server/src/ai/shared/repairToolCall.ts` | 工具调用修复 |
| `apps/server/src/ai/agent-templates/` | Agent 模板（提示词 + 配置） |

### 子代理存储

每个子代理复用主对话的完整存储逻辑，存储在 session 子目录中：

```
<session-root>/agents/<agentId>/
├── messages.jsonl  # StoredMessage 格式，含 parentMessageId 链
└── session.json    # 元数据 (id, title, task, agentType, createdAt)
```

关键函数（`chatFileStore.ts` / `messageStore.ts`）：
- `registerAgentDir()` — 注册 agent 子目录到 sessionDirCache
- `saveAgentMessage()` — 文件级持久化（无 DB），自动计算 parentMessageId
- `writeAgentSessionJson()` — 写入 agent 元数据
- `listAgentIds()` — 列出 session 下所有子代理

### API & 前端

| 文件 | 用途 |
|------|------|
| `packages/api/src/routers/absSetting.ts` | agentSummarySchema（含 isSystem） |
| `packages/api/src/types/tools/agent.ts` | spawn-agent 工具定义（含 modelOverride） |
| `apps/server/src/routers/settings.ts` | getAgents/deleteAgent 路由 |
| `apps/web/src/components/setting/menus/agent/AgentManagement.tsx` | Agent 列表（系统 Agent 标记、排序） |
| `apps/web/src/components/setting/menus/agent/AgentDetailPanel.tsx` | Agent 编辑面板（系统 Agent 限制） |
| `apps/web/src/components/setting/menus/provider/ProviderManagement.tsx` | 偏好设置（原模型设置，已精简） |

## systemAgentDefinitions.ts 结构

```typescript
export type SystemAgentId = 'master' | 'document' | 'shell' | 'browser' | 'email' | 'calendar' | 'widget' | 'project'

export interface SystemAgentDefinition {
  id: SystemAgentId
  name: string           // 显示名称
  description: string    // Agent 描述
  icon: string           // 图标标识
  capabilities: string[] // 能力组列表
  allowSubAgents: boolean
  maxDepth: number
  isPrimary: boolean     // 是否为主 Agent
}

// 导出
export const SYSTEM_AGENT_DEFINITIONS: SystemAgentDefinition[]
export const SYSTEM_AGENT_MAP: Map<string, SystemAgentDefinition>
export function isSystemAgentId(id: string): boolean
export function getPrimaryAgentDefinition(): SystemAgentDefinition
```

## subAgentFactory (agentFactory) 数据驱动流程

```
createSubAgent(input)
  1. resolveEffectiveAgentName() — 处理 legacy 别名映射
  2. resolveAgentType() — 判断类型：system | test-approval | dynamic | default
  3. 按类型分支：
     - system → 从 SYSTEM_AGENT_MAP 获取定义，用 capabilities 构建工具集
     - test-approval → 特殊审批 Agent
     - dynamic → resolveAgentByName() 加载自定义 Agent
     - default → fallback 到 master 定义
  4. 如果 config.model 非空 → resolveAgentModel() 获取模型实例
```

文件位置：`apps/server/src/ai/services/agentFactory.ts`

## 设置页面迁移

从"模型设置"中移除（标记 @deprecated）：
- chatSource、modelQuality、toolModelSource
- modelDefaultChatModelId、modelDefaultToolModelId
- autoSummaryEnabled、autoSummaryHours

保留（改名为"偏好设置"）：
- modelResponseLanguage、chatOnlineSearchMemoryScope、modelSoundEnabled

## 前端 Agent 管理规则

- 系统 Agent 显示蓝色"系统"标签
- 系统 Agent 排在列表顶部
- 系统 Agent 限制：名称只读、能力组 Switch 禁用、不可删除
- 系统 Agent 可修改：模型配置、系统提示词
- 自定义 Agent 无限制

## Skill 系统

### 注入架构概览

Skill 采用**两阶段 Progressive Disclosure** 设计，避免一次性注入所有 skill 正文导致 token 浪费：

1. **阶段一：索引注入（Preface）** — 首条 chat preface 的 `<system-reminder>` 仅注入 name + description 摘要列表（"菜单"）
2. **阶段二：动态展开（User Message）** — 用户输入 `/skill/name` 时，后端解析并将完整 SKILL.md 正文作为 `data-skill` 部分注入到该条 user 消息中（"菜本身"），不会回溯修改 preface

消息流示意：

```
┌─ Preface (system) ─────────────────────────────────┐
│ <system-reminder>                                   │
│   # Skills 列表（摘要）                               │
│   - skill-A [project] 描述A (command: /skill/A)     │
│   - skill-B [workspace] 描述B (command: /skill/B)   │
│ </system-reminder>                                  │
│ <system-reminder> 会话上下文 </system-reminder>       │
│ <system-reminder> Memory </system-reminder>          │
└─────────────────────────────────────────────────────┘

┌─ User Message ──────────────────────────────────────┐
│ [data-skill part: skill-A 完整正文]                   │
│ [text part: 用户实际输入文本]                          │
└─────────────────────────────────────────────────────┘
```

三层 Progressive Disclosure：
- **Layer 1**：元数据（name + description） — 始终在 preface 中
- **Layer 2**：SKILL.md 正文 — 仅在用户触发 `/skill/name` 时展开
- **Layer 3**：references/、scripts/、assets/ — 由 AI 在 skill 正文指引下主动读取

### 阶段一：Skill 索引注入（Preface）

Preface 构建时自动扫描所有可用 skill 的 YAML front matter，生成摘要列表注入为 Block 1。

**加载流程：**

```
loadSkillSummaries({ workspaceRootPath, projectRootPath, parentProjectRootPaths, globalSkillsPath })
  1. resolveSkillSources() — 按优先级排列 scope 来源
  2. findSkillFiles() — 递归扫描 .agents/skills/**/SKILL.md
  3. readSkillSummaryFromPath() — 解析 front matter（name + description）
  4. 去重合并：同名 skill 按优先级覆盖
  → SkillSummary[]
```

**多层优先级（低→高）：**

| 优先级 | Scope | 路径 |
|--------|-------|------|
| 1（最低）| global | `~/.agents/skills/` |
| 2 | workspace | `<workspace>/.agents/skills/` |
| 3 | parent-project | `<parent-project>/.agents/skills/`（可多层） |
| 4（最高）| project | `<project>/.agents/skills/` |

同名 skill 高优先级覆盖低优先级。

**ignoreSkills 过滤：**

- 工作空间级：`workspace.ignoreSkills` 配置（`workspace:<folderName>` 格式）
- 项目级：`<project>/.openloaf/project.json` 的 `ignoreSkills` 字段
- `resolveFilteredSkillSummaries()` 在 `prefaceBuilder.ts` 中应用过滤
- Agent 配置的 `selectedSkills` 进一步限定只注入特定 skill 摘要

**注入格式：**

`buildSkillsSummarySection()` 生成摘要文本 → `buildSkillsReminderBlock()` 包装为 `<system-reminder>` → 作为 preface Block 1 输出。

每条摘要格式：
```
- <name> [<scope>] <description> (command: `/skill/<name>`, path: `<abs-path>`)
```

### 阶段二：Skill 动态展开（User Message）

用户输入含 `/skill/name` 的文本时，后端在处理消息前解析并注入 skill 完整内容。

**前端触发：**

1. 用户在输入框输入 `/` → `ChatCommandMenu` 弹出斜杠命令菜单
2. 选择"技能"分组 → 显示可用 skill 列表（从 `trpc.settings.getSkills` 查询）
3. 选中某个 skill → `buildSkillCommandText(skillName)` 生成 `/skill/<name>` 文本插入输入框
4. 常量 `SKILL_COMMAND_PREFIX = "/skill/"` 定义在 `packages/api/src/common/chatCommands.ts`

**后端解析（AiExecuteService）：**

```
AiExecuteService.execute(request)
  1. SkillSelector.extractSkillNamesFromText(lastText)
     — 正则 /\/skill\/([^\s]+)/g 提取所有 skill name（去重、保序）
  2. resolveSkillMatches({ names, request })
     — 对每个 name 调用 SkillSelector.resolveSkillByName()
  3. SkillSelector.resolveSkillByName(name, roots)
     — 按 project → parent → workspace → global 顺序搜索
     — readSkillSummaryFromPath() 匹配 name（大小写不敏感）
     — readSkillContentFromPath() 读取完整正文（去 front matter）
     → SkillMatch { name, path, scope, content }
  4. buildSkillParts(matches) → data-skill 消息部分
  5. 将 data-skill parts 放在用户文本 parts 前面（模型优先读取）
```

**消息转换（messageConverter.ts）：**

`convertDataPart` 回调将 `data-skill` 类型转为模型可读文本：

```
# Skill: <name>
- scope: <scope>
- path: <abs-path>
<skill>
<完整 SKILL.md 正文（去 front matter）>
</skill>
```

### SKILL.md 文件格式

```
<project-or-workspace>/.agents/skills/<skill-folder>/
├── SKILL.md              # 主文件（YAML front matter + Markdown 正文）
├── references/           # 可选：参考文档、示例代码
├── scripts/              # 可选：自动化脚本
└── assets/               # 可选：图片、模板等资源
```

**Front matter 字段：**

```yaml
---
name: Skill Display Name        # 必填：显示名称（用于摘要和匹配）
description: 简短描述            # 必填：单行描述（注入到 preface 摘要）
version: 1.0.0                  # 可选：版本号
---
```

### Skill 关键文件索引

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/services/skillsLoader.ts` | `loadSkillSummaries()` — 扫描并加载 skill 摘要；`readSkillContentFromPath()` — 读取 skill 正文（去 front matter） |
| `apps/server/src/ai/tools/SkillSelector.ts` | `extractSkillNamesFromText()` — 正则提取 `/skill/name`；`resolveSkillByName()` — 按优先级搜索 skill |
| `apps/server/src/ai/shared/promptBuilder.ts` | `buildSkillsSummarySection()` — 生成摘要文本 |
| `apps/server/src/ai/shared/prefaceBuilder.ts` | `buildSkillsReminderBlock()` — 包装为 `<system-reminder>`；`resolveFilteredSkillSummaries()` — ignoreSkills 过滤 |
| `apps/server/src/ai/services/chat/AiExecuteService.ts` | `resolveSkillMatches()` / `buildSkillParts()` — 动态展开 skill 到 user message |
| `apps/server/src/ai/shared/messageConverter.ts` | `convertDataPart` 回调 — `data-skill` → 模型可读文本 |
| `apps/web/src/components/ai/input/ChatCommandMenu.tsx` | 前端斜杠菜单 — skill 选择 UI |
| `apps/web/src/components/ai/input/chat-input-utils.ts` | `buildSkillCommandText()` — 生成 `/skill/<name>` 命令文本 |
| `packages/api/src/common/chatCommands.ts` | `SKILL_COMMAND_PREFIX = "/skill/"` 常量定义 |

## Tool Search 机制

### 设计动机

Master Agent 从"启动时预加载 30+ 工具"改为"启动时只有 `tool-search` 一个工具"。这大幅减少了初始 token 消耗——工具定义不再全量注入到首次请求中，而是按需发现和激活。

### 核心概念

**`toolIds` vs `deferredToolIds`**（`AgentTemplate` 类型）：

- `toolIds`：核心工具，始终可见。Master Agent 当前只有 `['tool-search']`
- `deferredToolIds`：延迟工具（30+ 个），需要通过 `tool-search` 搜索后才可用。仅 Master Agent 使用此字段
- `AgentTemplate`（`agent-templates/types.ts`）是源头类型，含 `deferredToolIds`、`systemPrompt` 等运行时字段
- `SystemAgentDefinition`（`systemAgentDefinitions.ts`）是派生子集，不含 `deferredToolIds`

```typescript
// agent-templates/types.ts
type AgentTemplate = {
  toolIds: readonly string[]                // 核心工具
  deferredToolIds?: readonly string[]       // 延迟工具（仅 master）
  // ...其他字段
}
```

### ActivatedToolSet 类

Per-session 状态跟踪，管理哪些工具已被激活：

```typescript
// tools/toolSearchState.ts
class ActivatedToolSet {
  private readonly coreToolIds: ReadonlySet<string>   // 始终可用
  private readonly activatedIds = new Set<string>()   // 动态激活

  activate(toolIds: string[]): void
  getActiveToolIds(): string[]
  isActive(toolId: string): boolean
}
```

### createToolSearchTool()

两种查询模式：

1. **关键词搜索**：`tool-search(query: "email")` — 在 `TOOL_CATALOG_EXTENDED` 中按 id/keywords/group/label/description 评分，返回并激活最匹配的工具
2. **直接选择**：`tool-search(query: "select:read-file,list-dir")` — 按 ID 精确加载指定工具

工具定义在 `packages/api/src/types/tools/toolSearch.ts`，评分逻辑在 `toolSearchTool.ts` 的 `computeScore()`。

### 运行时集成

`agentFactory.ts` 中 `createMasterAgent()` 的完整流程：

```
createMasterAgent(input)
  1. getPrimaryTemplate() → master 模版
  2. 合并 coreToolIds + deferredToolIds → allToolIds
  3. buildToolset(allToolIds) → 注册全量工具（但不全部暴露）
  4. new ActivatedToolSet(coreToolIds) → per-session 状态
  5. createToolSearchTool(activatedSet, allToolIds) → 注入 tool-search 工具
  6. createToolSearchPrepareStep(allToolIds, activatedSet) → prepareStep 控制每步可见工具
  7. buildHardRules() + buildToolSearchGuidance() → 追加到 instructions
  8. new ToolLoopAgent(settings)
```

**`createToolSearchPrepareStep()`**：每一步执行前，只暴露 `core + activated` 的工具子集。模型看不到未激活的工具。

**`buildToolSearchGuidance()`**：生成 `<tool-search-guidance>` XML 块追加到 instructions 末尾，指导模型何时使用工具、何时直接回答。包含常见场景的 `select:` 快捷映射（如查时间 → `select:time-now`）。

### Tool Search 关键文件

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/tools/toolSearchState.ts` | `ActivatedToolSet` 类 — per-session 激活状态 |
| `apps/server/src/ai/tools/toolSearchTool.ts` | `createToolSearchTool()` — 关键词搜索 + 直接选择逻辑 |
| `packages/api/src/types/tools/toolSearch.ts` | `toolSearchToolDef` — 工具定义（Zod schema） |
| `packages/api/src/types/tools/toolCatalog.ts` | `TOOL_CATALOG_EXTENDED` — 全量工具元数据（id, label, keywords, group） |
| `apps/server/src/ai/services/agentFactory.ts` | `createToolSearchPrepareStep()` / `buildToolSearchGuidance()` — 运行时集成 |

## Hard Rules 层

### 设计定位

Layer 2 硬规则 — 不可被用户 `prompt.md` 覆盖的系统约束。通过 `buildHardRules()` 在 `agentFactory.ts` 中自动追加到 instructions 末尾。

### 指令组装链

```
agentFactory.ts → createMasterAgent()
  finalInstructions = systemPrompt + hardRules + toolSearchGuidance
```

- **systemPrompt**：来自 `prompt-v3.zh.md` / `prompt-v3.en.md`（Master Agent 模版）
- **hardRules**：`buildHardRules()` → 6 个规则函数拼接
- **toolSearchGuidance**：`buildToolSearchGuidance()` → `<tool-search-guidance>` XML 块

### 6 个硬规则构建函数

| 函数 | 内容 |
|------|------|
| `buildSystemTagsMetaRule()` | 系统标签说明 — `<system-reminder>` 等 XML 标签的含义 |
| `buildOutputFormatRules()` | 输出格式 — Markdown、`path:line` 引用、禁止 ANSI 转义码 |
| `buildFileReferenceRules()` | 文件引用 — `@[path]` 语法说明 |
| `buildAgentsDynamicLoadingRules()` | AGENTS.md 动态加载 — 搜索到的目录若含 AGENTS.md 须读取 |
| `buildAutoMemoryRules()` | Auto Memory — AI 自主管理 `.openloaf/memory/MEMORY.md` |
| `buildCompletionCriteria()` | 完成条件 — 问题解决或给出可执行下一步 |

### Hard Rules 关键文件

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/shared/hardRules.ts` | 全部 6 个规则函数 + `buildHardRules()` 聚合 |
| `apps/server/src/ai/services/agentFactory.ts` | 在 `createMasterAgent()` 中调用并追加到 instructions |
| `apps/server/src/ai/agent-templates/templates/master/prompt-v3.zh.md` | Master prompt v3 中文版 |
| `apps/server/src/ai/agent-templates/templates/master/prompt-v3.en.md` | Master prompt v3 英文版 |

## Memory 系统

### 存储路径

Memory 存储在 `.openloaf/memory/MEMORY.md`（独立目录，与 agent 配置解耦）。

```
<rootPath>/.openloaf/memory/
├── MEMORY.md          # 主 memory 文件（200 行截断限制）
└── <topic>.md         # 可选主题子文件（在 MEMORY.md 中链接）
```

每个 scope（workspace / parent-project / project）都有自己的 `.openloaf/memory/` 目录。

### MemoryBlock 分层架构

```typescript
// apps/server/src/ai/shared/memoryLoader.ts

type MemoryBlock = {
  scope: 'workspace' | 'parent-project' | 'project'
  label: string      // 如 "workspace memory"、"project memory"
  filePath: string   // 绝对路径
  content: string    // 截断后的内容
}

resolveMemoryDir(rootPath)    // → <rootPath>/.openloaf/memory/
readMemoryFile(rootPath)      // 读取 MEMORY.md
writeMemoryFile(rootPath, content) // 写入 MEMORY.md
resolveMemoryBlocks(input)    // → MemoryBlock[]（结构化输出）
resolveMemoryContent(input)   // @deprecated，合并为单个字符串
```

### 注入方式

Memory 作为独立的 `<system-reminder>` 块注入到 preface 末尾，每个 scope 一个块：

```
[<system-reminder> Skills </system-reminder>]              ← Block 1（仅有 skills 时）
<system-reminder> 会话上下文+项目配置 </system-reminder>      ← Block 2（不含 memory）
[<system-reminder> Workspace Memory </system-reminder>]    ← Block 3+（仅存在时）
[<system-reminder> Project Memory </system-reminder>]      ← Block 3+（仅存在时）
```

每个 memory block 格式：
```xml
<system-reminder>
Contents of /abs/path/.openloaf/memory/MEMORY.md
(user's auto-memory for workspace memory, persists across conversations):

# 实际 memory 内容
...
</system-reminder>
```

关键函数链：
- `assembleMemoryBlocks()` (`agentPromptAssembler.ts`) — 将 MemoryBlock[] 包装为 `<system-reminder>` 字符串数组
- `buildSessionPrefaceText()` (`prefaceBuilder.ts`) — 在末尾追加 memory blocks

### Auto Memory 规则

在 `hardRules.ts` (Layer 2) 中通过 `buildAutoMemoryRules()` 注入，让 AI 自主管理 memory：

- **路径**: `.openloaf/memory/MEMORY.md`
- **工具**: 使用 Write/Edit 工具直接操作
- **应该记什么**: 稳定模式、架构决策、工作流偏好、重复问题解决方案、用户明确要求
- **不应该记什么**: 临时状态、未验证信息、与 AGENTS.md 重复/矛盾内容、推测性结论
- **操作规则**: 200 行截断限制、主题子文件、避免重复、语义组织、用户纠正即更新

### Memory 关键文件

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/shared/memoryLoader.ts` | Memory 读写、路径解析、MemoryBlock 类型 |
| `apps/server/src/ai/shared/agentPromptAssembler.ts` | assembleMemoryBlocks() — 包装为 system-reminder |
| `apps/server/src/ai/shared/prefaceBuilder.ts` | Memory 独立注入到 preface 末尾 |
| `apps/server/src/ai/shared/hardRules.ts` | buildAutoMemoryRules() — AI 自主管理规则 |
| `apps/server/src/routers/settings.ts` | getMemory/saveMemory tRPC 路由（透明兼容） |

## OpenLoaf 源码规范

### 版权声明 (License Header)

**所有新建的源代码文件 (.ts, .tsx, .js, .jsx, .mjs, .cjs) 必须在文件顶部包含以下版权声明。** 这是为了确保项目在 AGPLv3 双授权模式下的法律合规性。

```javascript
/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
```

如果文件包含 Shebang (例如 `#!/usr/bin/env node`)，请将版权声明放在 Shebang 之后，并空开一行。

可以使用以下命令自动补全缺失的声明：
```bash
node scripts/add-headers.mjs
```

