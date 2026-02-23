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
