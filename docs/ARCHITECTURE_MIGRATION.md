# 架构迁移：从工作空间中心到项目中心

> 状态：**进行中（数据库迁移已补齐）** | 分支：`main` | 更新时间：2026-03-11

## 一、目标

将 OpenLoaf 从「工作空间（Workspace）包含多个项目（Project）」的层级架构，改为「项目（Project）作为独立一等公民」的扁平架构。

### 核心原则

1. **项目自治** — 每个 Project 独立拥有自己的文件、AI Agent、技能、聊天、任务
2. **项目链接** — 通过 `ProjectLink` 实现项目间共享记忆/技能（取代层级包含关系）
3. **多 Agent 架构** — Secretary Agent → Project Agent → Worker Agents
4. **全局统一入口** — 主窗口时间线（ActivityRecord）替代工作空间切换

---

## 二、已完成的工作

### 2.1 数据库 Schema 重构

**变更文件：** `packages/db/prisma/schema/*.prisma`（6 个文件）

| 操作 | 详情 |
|------|------|
| **移除 workspaceId** | 从所有核心模型中移除 `workspaceId` 字段（Board、ChatSession、CalendarSource、EmailMessage 等均已不依赖 workspaceId） |
| **新增 ProjectLink 模型** | `project.prisma` — 项目间多对多链接，复合主键 `(sourceId, targetId)`，级联删除 |
| **新增 ActivityRecord 模型** | `schema.prisma` — 主窗口活动时间线（type、title、referenceId、projectId、createdAt） |
| **新增 SchedulerTaskRecord 模型** | `schema.prisma` — 调度器任务执行历史记录 |
| **Project 模型扩展** | 新增 `linkedTo`/`linkedFrom` 关系字段、`type` 和 `lastOpenedAt` 索引 |

> **更新：** 已补充迁移文件 `packages/db/prisma/migrations/20260311195000_project_centric_architecture/migration.sql`，并通过临时 SQLite 库运行 `migrationRunner` 验证迁移结果。

### 2.2 API 层（packages/api）

**变更文件：** 28 个文件

| 模块 | 变更 |
|------|------|
| **workspace 兼容层** | 前端兼容数据已迁移到 `settings.getWorkspaceCompat`，旧 `workspace` tRPC 路由已从主路由表移除 |
| **absScheduledTask.ts** | `scope` 枚举从 `["workspace", "project"]` 改为 `["global", "project"]` |
| **absSetting.ts** | `skillScopeSchema` 从 `["workspace", "project", "global"]` 改为 `["project", "global"]`；`scopeFilter` 同步调整 |
| **absDynamicWidget.ts** | 移除 `workspaceId` 输入参数 |
| **路由 schema** | `board.ts`、`calendar.ts`、`chat.ts`、`email.ts`、`fs.ts`、`project.ts` — 全部移除 `workspaceId` 参数 |
| **类型定义** | `workspace.ts`、`boardCollab.ts`、`image.ts`、`message.ts`、`saasMedia.ts` — 移除 workspaceId 字段 |
| **服务** | `workspaceConfig.ts` 大幅精简、`projectDbService.ts` / `projectStorageService.ts` / `projectTreeService.ts` / `vfsService.ts` 等移除 workspaceId 参数 |
| **新增** | `appConfigService.ts`（全局应用配置管理）、`appConfig.ts`（配置类型定义） |

### 2.3 Server 端（apps/server）

**变更文件：** 93 个文件

| 模块 | 变更 |
|------|------|
| **路由层** | `settings.ts` — 全部 `"workspace"` scope 替换为 `"global"`<br/>`email.ts` — 移除所有 workspaceId 参数传递（160 行变更）<br/>`calendar.ts` — 移除 workspaceId<br/>`chat.ts` — 移除 workspaceId<br/>`scheduledTask.ts` — 简化，使用 `getProjectRootPath()` 代替 workspace 路径解析<br/>`dynamicWidget.ts` — 移除 workspaceId<br/>`workspace.ts` — **已删除**（功能由 `absWorkspace.ts` 的默认实现承接） |
| **AI 服务** | `chatStreamService.ts`、`messageStore.ts`、`chatFileStore.ts`、`imageStorage.ts`、`videoStorage.ts` — 移除 workspaceRootPath 参数<br/>`prefaceBuilder.ts`、`subAgentPrefaceBuilder.ts` — 移除 workspace 上下文注入<br/>`agentConfigService.ts`、`skillsLoader.ts`、`memoryLoader.ts` — scope 从 "workspace" 改为 "global"<br/>`toolScope.ts` — `ToolScope` / `AgentScope` / `SkillScope` 枚举移除 "workspace" 值 |
| **AI 工具** | `fileTools.ts`、`emailTools.ts`、`calendarTools.ts`、`taskTools.ts`、`documentTools.ts`、`browserAutomationTools.ts`、`widgetTools.ts`、`mediaGenerateTools.ts`、`jsxCreateTool.ts` — 移除 workspaceRootPath 参数 |
| **邮件模块** | `emailFileStore.ts`、`emailConfigStore.ts`、`emailAccountService.ts`、`emailSyncService.ts`、`emailIdleManager.ts`、`tokenManager.ts` — 全部移除 workspaceRootPath，使用 `getOpenLoafRootDir()` 替代 |
| **媒体模块** | `hlsService.ts`、`hlsRoutes.ts`、`mediaProxy.ts` — 移除 workspaceRootPath |
| **任务系统** | `taskConfigService.ts`、`taskExecutor.ts`、`taskOrchestrator.ts`、`taskScheduler.ts` — 移除 workspace 依赖 |
| **测试** | 全部测试文件中的 `"workspace"` scope 替换为 `"global"`，移除 workspace mock 参数（12 个测试文件） |

### 2.4 Web 前端（apps/web）

**变更文件：** 78 个文件

| 模块 | 变更 |
|------|------|
| **SidebarWorkspace.tsx** | **已删除**（830 行） |
| **SidebarUserAccount.tsx** | **新建** — 从原 SidebarWorkspace 提取用户账户 UI（头像、登录/登出、会员徽章、更新检查），不含工作空间选择器/创建对话框 |
| **Sidebar.tsx** | SidebarHeader 顶部渲染 `<SidebarUserAccount />`，移除原 SidebarWorkspace 引用 |
| **WorkspaceBootstrap.tsx** | 兼容层启动器，仅负责默认 workspace cookie 与默认 AI 标签页初始化；`useWorkspace()` 已改为轻量 query hook |
| **Scope 替换** | 6 个组件中 `"workspace"` → `"global"`：`use-main-agent-model.ts`、`AgentDetailPanel.tsx`、`AgentManagement.tsx`、`ProjectAgentView.tsx`、`SkillsSettingsPanel.tsx`、`ScheduledTaskDialog.tsx` |
| **workspaceId / useWorkspace 清理** | 继续清理 AI、Board、Calendar、Email、File、Desktop、Tasks、Settings、Project 页面中的 `workspaceId` 传递与 `useWorkspace()` 依赖；前端业务组件已不再直接依赖 `useWorkspace()`，仅保留 `hooks/use-workspace.ts` 与 `WorkspaceBootstrap.tsx` 兼容层；Calendar 页面/任务聚合/Electron 桥接类型、Email 页面/栈/下载链接/OAuth、Search 弹层 / recent-open 本地缓存、Markdown / Terminal 文件视图，以及 Settings 中 Skills / Agent 管理页的目录定位逻辑均已不再依赖前端 `workspaceId` guard |
| **Hooks** | `use-tabs.ts`（移除 workspaceId 字段及 workspaceTabs 逻辑）、`use-navigation.ts`、`use-sidebar-navigation.ts`、`use-chat-sessions.ts` 等 |
| **i18n** | `nav.json`（3 语言）更新导航翻译 key |

### 2.5 Desktop（apps/desktop）

**变更文件：** 6 个文件

| 文件 | 变更 |
|------|------|
| `mainWindow.ts` | 移除 workspace 相关 IPC |
| `index.ts` | 移除 workspace 初始化逻辑 |
| `ipc/index.ts` | 移除 workspace IPC handler |
| `preload/index.ts` | 移除 workspace API 暴露 |
| `calendarSync.ts` | 移除 workspaceId 参数 |

### 2.6 编译状态

| 包 | 状态 |
|----|------|
| `packages/db` | ✅ 通过 |
| `packages/config` | ✅ 通过 |
| `packages/api` | ✅ 通过 |
| `packages/ui` | ✅ 通过 |
| `apps/server` | ✅ 通过 |
| `apps/web` | ✅ 通过 |
| `apps/desktop` | ✅ 通过 |

**全部 7/7 包 TypeScript 编译零错误。**

### 2.7 统计摘要

- **变更文件总数：** 256 个
- **净代码变化：** -2309 行（删除 3961 行，新增 1652 行）
- **删除的服务端路由实现：** `apps/server/src/routers/workspace.ts`（121 行）
- **删除的前端组件：** `apps/web/src/components/workspace/SidebarWorkspace.tsx`（830 行）
- **新增组件：** `SidebarUserAccount.tsx`、`appConfigService.ts`、`appConfig.ts`

---

## 三、待完成的工作

### 3.1 数据库迁移（优先级：P0 — 已完成）

- [x] 生成迁移文件 `packages/db/prisma/migrations/20260311195000_project_centric_architecture/migration.sql`
- [x] 验证迁移能正确处理：
  - 移除各表 `workspaceId` 列
  - 创建 `ProjectLink` 表
  - 创建 `ActivityRecord` 表
  - 创建 `SchedulerTaskRecord` 表
  - 更新 `Project` 表索引
- [x] 在迁移 SQL 的 `RedefineTables` 阶段保留既有 `projectId` / `sourceId` / `accountEmail` 关联，本次无需额外独立数据迁移脚本
- [x] 执行 `pnpm run db:generate` 重新生成 Prisma 客户端

### 3.2 运行时验证（优先级：P0）

- [ ] 完整端到端测试：启动 server + web，验证基础流程可用
- [ ] 验证 workspace.getActive 兼容层在前端正常工作
- [ ] 验证邮件系统在无 workspaceId 下正常收发
- [ ] 验证日历系统正常
- [ ] 验证 AI 聊天流程正常（创建会话、发送消息、工具调用）
- [ ] 验证任务系统（创建/执行/调度）
- [ ] 验证画布系统（创建/编辑/协作）

### 3.3 useWorkspace 过渡层清理（优先级：P1）

前端业务组件侧的 `useWorkspace()` 直接依赖已清理完毕；当前仅保留 `hooks/use-workspace.ts` 兼容 hook 与 `WorkspaceBootstrap` 启动器处理兼容副作用。

- [x] 逐步移除各组件对 `useWorkspace()` 的依赖（已清理 AI / Board / Calendar / Email / File / Desktop / Tasks / Settings / Project 等业务组件，当前仅剩兼容层本身）
- [x] 已移除 `WorkspaceProvider` 与 `workspaceContext.tsx`；兼容 hook 已迁移到 `hooks/use-workspace.ts`
- [x] 移除 `workspace` tRPC 路由暴露，并清理前端 `trpc.workspace.*` 客户端调用
- [ ] 清理 `workspace.json` i18n 中不再需要的翻译 key

### 3.4 新功能开发（优先级：P2）

| 功能 | 说明 |
|------|------|
| **ProjectGridPage** | 项目列表页面（替代原工作空间列表） |
| **ActivityTimeline** | 主窗口活动时间线组件（消费 ActivityRecord） |
| **项目链接 UI** | ProjectLink 的创建/管理界面 |
| **多 Agent 架构** | Secretary Agent → Project Agent → Worker Agents 调度系统 |
| **Electron 多窗口** | 每个项目可独立窗口打开 |

### 3.5 测试完善（优先级：P2）

- [ ] 更新所有现有单元测试以适应新架构
- [ ] 邮件模块测试（4 个测试文件已更新，需要运行验证）
- [ ] AI 工具 scope 测试（已更新，需要运行验证）
- [ ] 任务系统测试（已更新，需要运行验证）
- [ ] 新增 ProjectLink 相关测试
- [ ] 新增 ActivityRecord 相关测试

### 3.6 文档与清理（优先级：P3）

- [x] 更新 `CLAUDE.md` 中的术语规范（简化 workspace 相关说明）
- [x] 更新 `docs/DEVELOPMENT.md`
- [ ] 清理残留的 workspace 相关注释和死代码
- [ ] 更新 `.agents/skills/` 中引用 workspace 的 skill 文档

---

## 四、架构对照

### 迁移前

```
Workspace (顶层容器)
  ├── Project A (文件夹)
  ├── Project B (文件夹)
  └── 全局设置
```

- 所有数据（邮件、日历、聊天、画布）都挂在 workspaceId 下
- 切换工作空间 = 切换整个上下文
- 多个工作空间之间数据隔离

### 迁移后

```
OpenLoaf (全局单例)
  ├── Project A ←→ Project B (ProjectLink)
  ├── Project C
  ├── 全局配置 (~/.openloaf/)
  └── ActivityTimeline (统一时间线)
```

- 项目独立存在，不依赖工作空间容器
- 项目间通过 ProjectLink 共享记忆/技能
- 邮件、日历作为全局服务（不绑定项目）
- 统一活动时间线替代工作空间切换

### 数据归属变更

| 数据 | 迁移前 | 迁移后 |
|------|--------|--------|
| 聊天会话 | `workspaceId` + `projectId` | `projectId`（可选） |
| 画布 | `workspaceId` + `projectId` | `projectId`（可选） |
| 日历 | `workspaceId` | 全局（通过 CalendarSource.projectId 可选关联） |
| 邮件 | `workspaceId` + `accountEmail` | `accountEmail`（全局） |
| 任务 | `scope: "workspace"` | `scope: "global" \| "project"` |
| Agent 配置 | `scope: "workspace"` | `scope: "global" \| "project"` |
| Skill 配置 | `scope: "workspace"` | `scope: "global" \| "project"` |

---

## 五、兼容性策略

### useWorkspace 兼容层

当前兼容数据由 `settings.getWorkspaceCompat` 提供，`useWorkspace()` 在前端直接查询该接口并返回默认 workspace 对象；顶层通过 `WorkspaceBootstrap` 维持 cookie 与默认标签页副作用。

这确保了前端 `useWorkspace()` 及其 ~60 个消费组件无需立即全部重写，可以渐进式迁移。

### 前端过渡路径

1. **Phase 1（已完成）** — 移除 `workspace` tRPC 路由与 `WorkspaceProvider`，保留 `useWorkspace()` 兼容 hook
2. **Phase 2（当前）** — 逐步移除组件中的 `useWorkspace()` 调用，替换为直接使用 projectId / rootUri
3. **Phase 3** — 删除 `useWorkspace()` 兼容 hook 与残余 `workspace` 翻译 key
