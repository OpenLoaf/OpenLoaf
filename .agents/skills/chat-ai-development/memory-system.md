
## Memory System — 记忆系统架构与开发指南

### 概述

记忆系统为 AI Agent 提供跨会话的持久化知识存储。采用**文件即真相**原则，不依赖向量数据库，使用关键词匹配 + 日期衰减权重排序。

### 架构

```
读路径:
  Agent → tool-search("select:memory-search") → memory-search(query)
       → memoryIndexManager.search(dirs, query, topK)
       → 返回 [{filePath, fileName, date, summary, decayWeight, score}]
  Agent → tool-search("select:memory-get") → memory-get(filePath)
       → readFileSync(filePath) → 返回完整内容

写路径:
  Agent → tool-search("select:memory-save") → memory-save(key, content, scope, mode, tags)
       → resolveWriteDir(scope) → findExistingMemoryFile(dir, key)
       → writeFileSync() → updateMemoryIndex() → memoryIndexManager.invalidate()
       → 返回 {ok, action, filePath, scope, previousContentPreview?}
```

### 记忆文件结构

```
~/.openloaf/memory/                     # 用户级记忆（全局）
├── MEMORY.md                           # 索引文件（常青，decayWeight=1.0）
├── 2026-03-17-food-preferences.md      # 主题记忆（日期衰减）
├── 2026-03-15-debug-patterns.md
└── agents/                             # Agent 专属记忆
    ├── coder/MEMORY.md
    └── browser/MEMORY.md

{projectRoot}/.openloaf/memory/         # 项目级记忆
├── MEMORY.md
└── 2026-03-17-architecture-decisions.md
```

**文件命名约定**：`{YYYY-MM-DD}-{key}.md`
- 日期用于衰减权重计算（半衰期 30 天）
- key 为语义标识符（小写字母 + 连字符）
- 无日期前缀的文件（如 MEMORY.md）为常青文件，权重恒为 1.0

**记忆文件格式**：
```markdown
---
tags: [food, preference, personal]
created: 2026-03-17
updated: 2026-03-20
---

不爱吃生西红柿和生洋葱。
```

frontmatter 中的 tags 值会被 `extractKeywords()` 自然提取为搜索关键词，提升召回率。

### 作用域层级

| 作用域 | 目录 | 用途 |
|--------|------|------|
| `user` | `~/.openloaf/memory/` | 全局用户偏好、跨项目知识 |
| `project` | `{projectRoot}/.openloaf/memory/` | 项目特定的架构决策、调试笔记 |
| `parent-project` | 父项目的 `.openloaf/memory/`（只读） | 继承父项目知识 |
| `agent` | `~/.openloaf/memory/agents/{agentName}/` | 专业 Agent 的领域记忆 |

搜索时按 scope 过滤，不指定 scope 则搜索所有可见范围。

### 索引管理器 (MemoryIndexManager)

**位置**：`apps/server/src/memory/memoryIndexManager.ts`

- 内存中维护文件索引（`Map<dirPath, Map<filePath, MemoryEntry>>`）
- 5 分钟扫描间隔，支持 `force` 强制刷新和 `invalidate(dir)` 主动失效
- 关键词提取：全文词分割，2-50 字符，去重
- 衰减算法：`weight = exp(-ln(2)/30 * ageInDays)`
- 搜索评分：`matchScore × decayWeight`，matchScore = 匹配关键词数 / 查询关键词数

### 工具三件套

| 工具 ID | 名称 | 风险 | 审批 | 用途 |
|---------|------|------|------|------|
| `memory-search` | 记忆搜索 | Read | 否 | 按关键词搜索记忆 |
| `memory-get` | 读取记忆 | Read | 否 | 按路径读取完整内容 |
| `memory-save` | 保存记忆 | Write | 是 | 新建/更新/追加/删除记忆 |

### memory-save 工具设计

**参数**：
- `key` (必填)：记忆标识符，`[a-z0-9-]`，最大 60 字符
- `content` (delete 时可选)：Markdown 内容，最大 10KB
- `scope`：`user`(默认) | `project` | `agent`
- `mode`：`upsert`(默认) | `append` | `delete`
- `tags`：字符串数组，注入 frontmatter 提升搜索精度
- `indexEntry`：MEMORY.md 索引摘要，不提供则从 content 首行提取

**Upsert 行为**（默认模式）：
1. 解析目标目录（scope + requestContext）
2. 搜索已有 `*-{key}.md` 文件
3. 如存在：删除旧文件，创建 `{today}-{key}.md`（日期刷新 = 权重重置）
4. 如不存在：创建新文件
5. 构建 frontmatter（tags + created/updated 日期）
6. 更新 MEMORY.md 索引
7. 调用 `memoryIndexManager.invalidate(dir)` 刷新缓存
8. 返回 `{ ok, action: "created"|"updated", filePath, previousContentPreview? }`

**Append 行为**：追加内容到已有文件末尾，用 `---` 分隔。不存在则退化为创建。

**Delete 行为**：删除 `*-{key}.md` 文件 + 移除 MEMORY.md 索引条目 + 刷新缓存。

**MEMORY.md 自动维护**：
- 每次 save/delete 自动更新索引
- 格式：`- [key](filename) — summary`
- 去重：按 `[key]` 匹配，先删后加

### 关键文件路径

| 文件 | 用途 |
|------|------|
| `packages/api/src/types/tools/memory.ts` | 工具定义（ToolDef + Meta） |
| `packages/api/src/types/tools/toolCatalog.ts` | 工具目录（关键词 + 分组） |
| `apps/server/src/ai/tools/memoryTools.ts` | 工具实现（search + get + save） |
| `apps/server/src/ai/tools/toolRegistry.ts` | 工具注册表 |
| `apps/server/src/memory/memoryIndexManager.ts` | 内存索引管理器 |
| `apps/server/src/ai/shared/memoryLoader.ts` | 记忆文件 I/O + 结构化加载 |
| `apps/server/src/ai/agent-templates/templates/master/index.ts` | Master Agent 模板（deferredToolIds） |

### 设计原则（论文驱动）

本设计综合了以下学术研究的核心洞察：

| 原则 | 论文 | 应用 |
|------|------|------|
| 记忆读写是一等工具 | MemGPT (2310.08560) | `memory-save` 作为独立工具，不依赖 agent 组合通用文件工具 |
| Agent 自主组织记忆结构 | A-MEM (2502.12110, NeurIPS 2025) | tags 由 agent 决定；内容格式自由 |
| 工具命名对齐认知模型 | Tool Preferences Unreliable (2505.18135) | 叫 `memory-save` 而非 `apply-patch-to-memory-dir` |
| 单次调用完成完整操作 | ToolScan IAC 错误分类 (2411.13547) | 写文件 + 索引 + 缓存刷新在一个工具调用内完成 |
| 返回值可操作 | Reflexion (2303.11366) | 返回 action/previousContent/hint 帮助 agent 自我修正 |
| 频繁更新的记忆不衰减 | MemoryBank (2305.10250) | upsert 刷新日期前缀 = 重置衰减权重 |

### 添加新记忆工具的步骤

遵循 fullstack-patterns.md 的标准流程：

1. **定义 ToolDef**：`packages/api/src/types/tools/memory.ts` 新增 def + meta
2. **后端实现**：`apps/server/src/ai/tools/memoryTools.ts` 新增 tool 函数
3. **注册**：`toolRegistry.ts` 添加映射
4. **目录**：`toolCatalog.ts` 添加 TOOL_DEFS + TOOL_KEYWORDS
5. **模板**：master `deferredToolIds` 追加
6. **前端**：memory-save 使用默认 UnifiedTool 卡片，无需自定义 UI

### 演进路径

| 版本 | 能力 | 触发条件 |
|------|------|---------|
| V1 (当前) | memory-save CRUD 闭环 | — |
| V2 | tag 精确匹配加权搜索 | 记忆文件 > 30 个 |
| V3 | Agent 自动合并碎片记忆 | 单 key append > 5 次 |
| V4 | 预定义记忆模板（偏好/调试/决策） | 高频模式识别后 |
| V5 | Reflexion 自反思：失败后搜索历史经验 | 工具错误率达阈值 |
