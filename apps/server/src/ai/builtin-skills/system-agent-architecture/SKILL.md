---
name: system-agent-architecture
description: >
  【必读】当你需要做以下任何事情时，立即加载此 skill：
  ① 判断当前请求应由哪个 Agent 处理（Master vs PM vs 子 Agent）；
  ② 了解 Master Agent 和 PM Agent 的职责区别与切换条件；
  ③ 查询某个子 Agent（coder/email/calendar/shell/document/vision）的能力范围；
  ④ 理解页面上下文（pageContext）如何决定注入哪些工具和知识；
  ⑤ 决定是否需要创建临时项目（用户在全局页面请求项目级操作时）；
  ⑥ 理解 Skill 自动加载机制（哪些 skill 在什么条件下被激活）；
  ⑦ 处理会话切换逻辑（用户切换页面/项目时 Agent 上下文如何变化）；
  ⑧ 实现或修改上下文注入规则（不同页面注入哪些 systemPrompt 片段）；
  ⑨ 理解 Agent 层级模型的完整拓扑（谁调度谁、谁向谁汇报）；
  ⑩ 查阅 6 个内置子 Agent 的详细配置（模板、工具集、适用场景）。
  涵盖：页面上下文感知矩阵、Skill 自动加载体系、临时项目创建规则、
  Agent 层级模型（Master/PM + 6 子 Agent）、会话与上下文生命周期管理。
version: 2.1.0
---

# OpenLoaf AI Agent 系统架构

> **核心设计理念**：「用户在哪里，AI 就知道什么」—— 上下文感知是整个体系的灵魂。

用户不需要告诉 AI「我正在看项目列表」或「我在编辑画布」，系统根据用户所在页面自动感知上下文，注入对应能力和知识，让 AI 成为每个页面的原生助手。

---

## 一、页面上下文感知

### 1.1 上下文数据结构

每条用户消息自动携带 `pageContext`，用户无感知：

```typescript
type ChatPageContext = {
  scope: 'global' | 'project'
  page: string              // 页面标识符
  projectId?: string        // 项目模式下必有
  boardId?: string          // 画布页面必有
}
```

扩展到 `ChatRequestBody`，随消息发送到服务端。

### 1.2 全局模式页面矩阵

| # | 页面 | pageContext | 自动注入 | AI 能做什么 |
|---|------|-----------|---------|------------|
| 1 | 画布列表 | `{scope:'global', page:'canvas-list'}` | — | 搜索/筛选画布、创建画布、解释内容、批量操作 |
| 2 | 项目列表 | `{scope:'global', page:'project-list'}` | — | 搜索项目、创建项目、对比项目、归档建议 |
| 3 | Agent 列表 | `{scope:'global', page:'agent-list'}` | — | 解释 Agent 用途、推荐配置、创建自定义 Agent |
| 4 | 技能列表 | `{scope:'global', page:'skill-list'}` | — | 解释技能、安装/卸载、编排建议 |
| 5a | 工作台 | `{scope:'global', page:'workbench'}` | — | Widget 管理、布局建议、快速导航 |
| 5b | 日历 | `{scope:'global', page:'calendar'}` | — | 创建/查询日程、时间规划、冲突检测 |
| 5c | 邮箱 | `{scope:'global', page:'email'}` | — | 撰写/回复邮件、摘要、分类 |
| 5d | 全局任务 | `{scope:'global', page:'tasks'}` | — | 任务 CRUD、进度跟踪、优先级建议 |
| 5e | 全局设置 | `{scope:'global', page:'settings'}` | — | 配置解释、推荐设置、问题诊断 |
| 5f | 临时画布 | `{scope:'global', page:'temp-canvas'}` | `boardId` | 画布编辑、节点操作、内容生成 |
| 6 | AI 助手 | `{scope:'global', page:'ai-chat'}` | — | 通用对话、按需调度子 Agent |

### 1.3 项目模式页面矩阵

| # | 页面 | pageContext | 自动注入 | AI 能做什么 |
|---|------|-----------|---------|------------|
| 6a | 项目看板 | `{scope:'project', page:'project-index', projectId}` | `projectId` | 概览分析、待办建议、文件推荐 |
| 6b | 项目文件 | `{scope:'project', page:'project-files', projectId}` | `projectId` | 文件搜索/编辑、代码分析、文档生成 |
| 6c | 项目画布 | `{scope:'project', page:'project-canvas', projectId}` | `projectId` | 项目画布管理、关联文件 |
| 6d | 项目历史 | `{scope:'project', page:'project-history', projectId}` | `projectId` | 变更分析、版本对比、回滚建议 |
| 6e | 项目任务 | `{scope:'project', page:'project-tasks', projectId}` | `projectId` | 任务管理、进度报告、Sprint 规划 |
| 6f | 项目设置 | `{scope:'project', page:'project-settings', projectId}` | `projectId` | 项目配置、集成管理 |

### 1.4 前端上下文注入点

各页面组件负责将 `pageContext` 注入到 ChatInput 的 `requestParams` 中，服务端从 `ChatRequestBody` 解析。

关键文件：
- 页面组件（Sidebar、Project、CanvasListPage 等）→ 设置 `chatParams`
- `ChatInput.tsx` → 从 `chatParams` 提取并附加到请求
- `transport.ts` → `prepareSendMessagesRequest()` 携带 `pageContext`

---

## 二、Skill 自动加载体系

### 2.1 设计原则

- **零配置**：用户不需要手动选择 skill，系统根据 pageContext 自动加载
- **可叠加**：自动 skill + 用户手动 `/skill/xxx` 叠加使用
- **懒注入**：skill 内容在会话首条消息或上下文切换时注入，不每条重复

### 2.2 内置 OpenLoaf Skill 矩阵

| Skill 名称 | 触发页面 | 核心能力 |
|-----------|---------|---------|
| `openloaf-basics` | **所有页面（始终加载）** | OpenLoaf 产品认知、架构规则、通用操作 |
| `canvas-ops` | 画布列表、临时画布、项目画布 | 画布 CRUD、节点编辑、布局优化 |
| `project-ops` | 项目列表、项目模式所有页面 | 项目管理、文件操作、Git 操作 |
| `calendar-ops` | 日历 | 日程 CRUD、时间管理、提醒设置 |
| `email-ops` | 邮箱 | 邮件撰写、回复、摘要、分类 |
| `task-ops` | 全局任务、项目任务 | 任务管理、看板操作、进度跟踪、调度配置、审批流程 |
| `settings-guide` | 全局设置、项目设置 | 配置说明、推荐值、问题排查 |
| `file-ops` | 项目文件 | 文件读写、代码分析、文档生成 |
| `workbench-ops` | 工作台 | Widget 管理、布局定制 |

### 2.3 页面 → Skill 自动加载映射（权威表）

服务端在 `AiExecuteService` 中根据 `pageContext.page` 查表，自动追加 skill。映射源码见 `pageContextSkillMap.ts`。

| pageContext.page | 自动加载的 skill |
|-----------------|-----------------|
| `canvas-list` | `canvas-ops` |
| `temp-canvas` | `canvas-ops` |
| `project-canvas` | `canvas-ops`, `project-ops` |
| `project-list` | `project-ops` |
| `project-index` | `project-ops` |
| `project-files` | `project-ops`, `file-ops` |
| `project-history` | `project-ops` |
| `project-tasks` | `project-ops`, `task-ops` |
| `project-settings` | `project-ops`, `settings-guide` |
| `calendar` | `calendar-ops` |
| `email` | `email-ops` |
| `tasks` | `task-ops` |
| `settings` | `settings-guide` |
| `workbench` | `workbench-ops` |
| `ai-chat` | （无额外 skill） |
| `agent-list` | （无额外 skill） |
| `skill-list` | （无额外 skill） |

所有页面始终追加 `openloaf-basics` 作为基线 skill。

### 2.4 加载规则

```
用户发送消息时：
1. 读取当前 pageContext
2. 查上方映射表获取对应 skill 列表
3. 始终追加 openloaf-basics
4. 合并用户手动 /skill/xxx 选择的 skill
5. 去重后注入消息
```

### 2.5 与现有 Skill 系统的关系

现有 skill 加载机制不变（两阶段 Progressive Disclosure）：
- 阶段一：索引注入（preface 中的 `<system-reminder>` 摘要列表）
- 阶段二：动态展开（`data-skill` part 注入到 user message）

自动加载的内置 skill 走相同的注入管道，区别仅在于**触发方式**：
- 手动 skill：用户输入 `/skill/xxx` 触发
- 自动 skill：服务端根据 `pageContext` 在 `AiExecuteService` 中自动追加到 `resolveSkillMatches` 结果

### 2.6 `openloaf-basics` Skill

openloaf-basics 的完整内容见 `apps/server/src/ai/builtin-skills/openloaf-basics/SKILL.md`。核心作用：为 Agent 提供 OpenLoaf 产品地图、工具选择决策树和跨模块导航框架。

关键文件：
- Skill 文件存放：`apps/server/src/ai/builtin-skills/`（内置）或 `.openloaf/skills/`（自定义覆盖）
- 自动加载映射：`apps/server/src/ai/services/chat/pageContextSkillMap.ts`
- 自动加载调用：`AiExecuteService.ts` 中 `resolveAutoSkillsByPageContext()` + `resolveSkillMatches()`

---

## 三、临时项目机制

### 3.1 触发条件

当用户在非项目上下文中对话，且涉及文件操作时，系统自动创建临时项目：

```
触发（任一即可）：
- Agent 需要调用 create-file / write-file 工具
- 用户上传了文件附件
- 用户明确要求生成文件类产物

不触发：
- 纯文本问答
- 查询类操作（搜索项目、查看日历等）
- 用户已在项目上下文中
```

### 3.2 存储位置

临时项目路径基于全局设置 `appTempStorageDir`（设置页「临时存储路径」）：

```
{appTempStorageDir}/temp-projects/{sessionId}/
```

如果用户未配置 `appTempStorageDir`，fallback 到 `~/.openloaf/temp/temp-projects/{sessionId}/`。

关键文件：
- 配置读取：`packages/api/src/types/basic.ts` → `appTempStorageDir`
- 服务端使用：`apps/server/src/modules/settings/openloafConfStore.ts`

### 3.3 用户体验流程

```
用户（全局模式）: "帮我写一个 Python 爬虫脚本"
    ↓
系统后台静默创建临时项目
    ↓
Agent 在临时项目目录下创建文件
    ↓
UI 浮现轻提示："文件已保存到临时项目"
    ↓
用户可选择：
  [打开项目查看] → 跳转到临时项目文件页
  [转为正式项目] → 重命名 + 移动到用户指定位置
  [忽略] → 保留，用户可手动删除
```

### 3.4 为什么不是每次对话都创建临时项目

- **开销**：大量对话是纯问答，不需要项目
- **噪音**：项目列表会充斥无用的临时项目
- **用户心智**：项目应该是有意义的容器，不是聊天记录的副产品

按需创建——只有当 Agent 真正需要文件系统时才创建。

---

## 四、Agent 层级模型

### 4.1 架构总览

```
┌──────────────────────────────────────────────────┐
│                  用户消息入口                      │
└──────────────────┬───────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────┐
│           主 Agent（Router / 调度层）              │
│                                                    │
│  全局模式 → AI 秘书 (Master)                      │
│  项目模式 → 项目经理 (PM)                         │
│                                                    │
│  职责：理解意图 → 决定自己处理 or 委派子 Agent     │
└──────────────────┬───────────────────────────────┘
                   ↓ （需要时委派）
┌──────────────────────────────────────────────────┐
│               内置子 Agent 池                      │
│                                                    │
│  📝 文档编辑专家 (Doc Editor)                     │
│  🌐 浏览器操作专家 (Browser)                      │
│  📊 数据分析专家 (Data Analyst)                   │
│  🔍 信息提取专家 (Extractor)                      │
│  🎨 画布设计专家 (Canvas Designer)                │
│  💻 代码工程师 (Coder)                            │
│                                                    │
│  用户不可见，由主 Agent 按需调度                    │
└──────────────────┬───────────────────────────────┘
                   ↓ （用户可自定义）
┌──────────────────────────────────────────────────┐
│            用户自定义 Agent                        │
│                                                    │
│  通过 .openloaf/agents/agent.json 定义             │
│  出现在 Agent 列表中，用户可手动切换               │
└──────────────────────────────────────────────────┘
```

### 4.2 主 Agent 定位

| 场景 | 默认主 Agent | 核心定位 | 典型行为 |
|------|-------------|---------|---------|
| 全局模式 | **AI 秘书 (Master)** | 全能管家 | 问答、调度子 Agent、跨模块操作 |
| 项目模式 | **项目经理 (PM)** | 项目专家 | 代码分析、任务管理、文件操作 |

切换规则：
- 进入项目 → 自动切换到 PM
- 离开项目回到全局 → 自动切换到 Master
- 用户可手动切换（Agent 选择器），手动选择优先级最高

### 4.3 内置子 Agent 详设

#### 📝 文档编辑专家 (Doc Editor)
- **触发时机**：主 Agent 判断用户意图是编辑/创建文档
- **能力**：富文本编辑（Plate.js）、Markdown/Word/PDF 转换、长文档改写、模板应用
- **工具集**：Write, Read, Glob
- **步数限制**：15 步 — 文档编辑通常是「读取 → 修改 → 写回」的短流程，15 步足够覆盖多文件场景
- **对用户可见性**：不可见（主 Agent 无缝委派）

#### 🌐 浏览器操作专家 (Browser)
- **触发时机**：用户要求网页操作、截图、表单填写
- **能力**：网页导航与截图、表单自动填写、数据抓取、页面交互
- **工具集**：browser-navigate, browser-click, browser-fill, BrowserScreenshot, browser-read, WebSearch
- **步数限制**：20 步 — 网页导航天然是多步骤的（打开页面 → 等待加载 → 点击 → 填表 → 截图），每个交互动作至少消耗 1 步，复杂页面流程需要更多余量

#### 📊 数据分析专家 (Data Analyst)
- **触发时机**：涉及 CSV/Excel 分析、数据可视化、统计
- **能力**：表格数据分析、图表生成（ECharts/Mermaid）、数据清洗、趋势分析
- **工具集**：Read, Write, JsRepl
- **步数限制**：15 步 — 数据分析的核心循环是「读取数据 → 计算 → 生成图表」，15 步覆盖大多数分析场景

#### 🔍 信息提取专家 (Extractor)
- **触发时机**：从文档/网页/图片中提取结构化信息
- **能力**：PDF/图片 OCR、表格提取、关键信息摘要、多文档对比提取
- **工具集**：Read, office-read, WebFetch
- **步数限制**：10 步 — 提取任务是聚焦的单一目标工作（从 A 中提取 B），不需要多轮探索

#### 🎨 画布设计专家 (Canvas Designer)
- **触发时机**：画布编辑、节点布局、可视化设计
- **能力**：画布节点 CRUD、自动布局优化、模板应用、从文本/大纲生成画布结构
- **工具集**：canvas-add-node, canvas-update-node, canvas-remove-node, canvas-layout, canvas-add-edge, canvas-read
- **步数限制**：15 步 — 画布操作需要多次节点增删和布局调整，但不如浏览器操作那样不可预测

#### 💻 代码工程师 (Coder)
- **触发时机**：编写/调试/重构代码（非项目模式下由 Master 委派）
- **能力**：多语言代码编写、代码审查、Bug 诊断、测试用例生成
- **工具集**：Write, Read, Grep, Glob, Bash
- **步数限制**：20 步 — 代码工程涉及「阅读现有代码 → 理解结构 → 编写 → 调试」的长链路，与浏览器类似需要较多余量
- **注意**：项目模式下 PM 自己有代码能力，不必委派

### 4.4 子 Agent 委派策略

```
用户消息 →
  ├─ 简单问答/闲聊 → 主 Agent 直接回答
  ├─ 单步操作（创建项目/发邮件等）→ 主 Agent 直接执行
  └─ 多步骤复杂任务 →
      ├─ 需要浏览器 → 委派 Browser
      ├─ 需要文档编辑 → 委派 Doc Editor
      ├─ 需要数据分析 → 委派 Data Analyst
      ├─ 需要信息提取 → 委派 Extractor
      ├─ 需要画布操作 → 委派 Canvas Designer
      ├─ 需要代码（全局模式）→ 委派 Coder
      └─ 混合任务 → 主 Agent 分解，依次或并行委派多个子 Agent
```

### 4.5 系统约束

- **最大深度**：2 级（主 → 子），子 Agent 不可继续 spawn
- **最大并发**：4 个子 Agent
- **自动清理**：5 分钟后完成的 Agent 自动从内存删除
- **步数硬限**：Master 30 步，Sub 15-20 步

---

## 五、会话与上下文管理

### 5.1 会话归属

| 模式 | 存储位置 | 可见位置 | 绑定 |
|------|---------|---------|------|
| 全局模式会话 | 全局 session 池 | AI 助手页面历史 | 无 projectId |
| 项目模式会话 | 绑定 projectId | 项目内右侧 Chat 面板 | projectId |
| 画布模式会话 | 绑定 boardId | 画布内 AI 节点 | boardId（可能同时有 projectId） |

### 5.2 上下文切换体验

```
场景：用户在项目 A 的文件页聊了几句，然后切换到全局日历页

期望行为：
1. 项目 A 的会话自动暂停（保留在项目 A 的 chat panel 中）
2. 全局日历页加载全局会话（上次在日历页的会话，或新建）
3. 自动加载 calendar-ops skill
4. 主 Agent 切换为 Master（AI 秘书）
5. Agent 知道用户"刚才在项目 A 工作，现在在看日历"

用户切回项目 A：
1. 恢复项目 A 的会话
2. 重新加载 project-ops skill
3. 主 Agent 切换为 PM
```

以上为设计目标行为。实际实现细节见对应源文件。

### 5.3 跨模块引用

用户经常需要跨模块操作：
- 在日历页说"把这个会议相关的文档整理到项目 X 里"
- 在项目里说"帮我发邮件给同事通知进度"

**策略**：主 Agent 通过 ToolSearch 按需激活跨模块工具，无需切换子 Agent。`openloaf-basics` skill 告诉 Agent 其他模块的存在和能力边界。

