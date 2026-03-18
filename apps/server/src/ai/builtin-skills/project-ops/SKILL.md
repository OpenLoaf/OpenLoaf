---
name: project-ops
description: 项目与工作空间管理——创建项目、打开代码仓库、整理项目结构、Git 版本控制。当用户提到项目、工作区、仓库、代码库、文件夹组织、"想开始一个新项目"、"打开我的代码"等意图时触发。
---

# 项目操作指南

## 为什么需要项目？

OpenLoaf 中一切文件操作都发生在**项目上下文**中。项目 = 一个磁盘根目录 + OpenLoaf 侧栏中的注册记录。所有文件工具（`read-file`、`apply-patch`、`list-dir`、`grep-files`、`shell-command`）的路径都**相对于项目根目录**，无法越界——这是安全沙箱设计。

## 决策流程

```
用户想操作文件
├─ 已在项目上下文？ → 直接用文件工具
└─ 不在项目上下文？
   ├─ 明确要创建项目 → project-mutate { action: "create" }
   └─ 随口说"帮我写个脚本" → 系统自动创建临时项目（见下文）
```

## 工具总览

| 工具 ID | 用途 | 需审批 |
|---------|------|--------|
| `project-query` | 查询项目（列表或详情） | 否 |
| `project-mutate` | 变更项目（创建/更新/移动/移除） | 是 |
| `read-file`、`list-dir`、`grep-files` | 项目内文件读取与搜索 | 否 |
| `apply-patch` | 项目内文件编辑 | 是 |
| `shell-command` | 在项目根执行命令（Git 等） | 是 |

## project-query

**list** — 项目树 + 扁平列表：`project-query { mode: "list" }`

**get** — 单个项目详情（省略 projectId 时用当前上下文）：`project-query { mode: "get" }`

## project-mutate

### create — 核心示例

```
project-mutate { action: "create", title: "Q2 Marketing", folderName: "q2-marketing", icon: "📊", enableVersionControl: true }
```

**指向已有目录** — 用户给出裸路径时，你必须转换为 `file://` 协议 URI：
- 用户说 `/Users/user/code/repo` → 你传 `rootUri: "file:///Users/user/code/repo"`
- 用户说 `~/my-project` → 先展开 `~`，再拼 `file:///Users/user/my-project`

**创建子项目** — `project-mutate { action: "create", title: "子模块", parentProjectId: "parent-id" }`
或在当前项目下：`{ action: "create", title: "子模块", createAsChild: true }`

### 何时创建顶层 vs 子项目

- 独立代码仓库、独立业务线 → **顶层项目**
- monorepo 中的子包、主项目的附属模块 → **子项目**（传 `parentProjectId`）
- 用户说"在当前项目下新建"→ 用 `createAsChild: true`

### folderName 决策

- 用户指定了文件夹名 → 用用户的
- 标题是中文或含特殊字符 → **必须**指定英文 `folderName`（磁盘不友好的字符会出问题）
- 标题是简洁英文 → 可省略，系统自动用 title 生成

### enableVersionControl 决策

- 默认 `true`，适合代码项目
- 纯文档、笔记、临时草稿 → 设 `false`（避免无意义的 Git 初始化）
- 用户导入已有 Git 仓库（有 rootUri）→ 设 `false`（仓库已有 `.git`）

### update / move / remove

`update`：`project-mutate { action: "update", projectId: "xxx", title: "新名称", icon: "🚀" }`
`move`：`project-mutate { action: "move", projectId: "xxx", targetParentProjectId: "parent-id" }`（`null` = 移到顶层）
`remove`：`project-mutate { action: "remove", projectId: "xxx" }` — **仅摘除注册记录，不碰磁盘文件**。用户的代码和数据不可逆，磁盘由用户主权管理。

## 临时项目

用户在**全局对话**（非项目上下文）中要求文件操作时，系统自动创建临时项目于 `~/.openloaf/temp/`，用户无需感知。

| 属性 | 正式项目 | 临时项目 |
|------|---------|---------|
| 创建方式 | `project-mutate { action: "create" }` | 系统自动创建 |
| 磁盘位置 | 用户指定或默认目录 | `~/.openloaf/temp/{sessionId}/` |
| 生命周期 | 用户手动移除 | 可提升为正式项目，或随会话清理 |

## 端到端流程

**探索项目**：`project-query { mode: "get" }` → `list-dir { path: ".", depth: 2 }` → `grep-files` → `read-file`

**创建项目**：`project-query { mode: "list" }` → `project-mutate { action: "create", ... }` → `apply-patch` 写初始文件 → `shell-command` 初始化依赖

## 常见错误与防范

**路径越界** — 所有路径相对于项目根，`../` 无法逃逸沙箱。原因：用户可能说"读一下 /etc/hosts"，但沙箱设计禁止访问项目外文件。应向用户解释路径限制，如需访问外部目录则建议创建新项目指向该目录。

**rootUri 格式错误** — 必须 `file://` 协议如 `file:///Users/user/project`，不能用裸路径。原因：跨平台 URI 标准要求协议前缀，裸路径会导致解析失败。记住：三个斜杠（`file:///`）= 协议 `file://` + 根路径 `/`。

**混淆 remove 与删除** — `remove` 只摘注册不碰磁盘。原因：防止误删用户代码。如果用户确实要删磁盘文件，需显式用 `shell-command rm -rf`。

**忘记先查询** — 变更前先 `project-query` 确认 projectId 和当前结构。原因：projectId 是随机生成的，靠猜测传入会操作错误的项目。
