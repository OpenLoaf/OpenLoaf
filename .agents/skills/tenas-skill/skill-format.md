# SKILL.md 文件规范

## 目录结构

每个技能是一个独立文件夹，包含一个必需的 `SKILL.md` 和可选的支持文档：

```
<skills-root>/
└── <skill-folder-name>/
    ├── SKILL.md              ← 必需，技能入口文件
    ├── detail-1.md           ← 可选，按领域拆分的详细参考
    ├── detail-2.md
    └── ...
```

## 存储位置

| 位置 | Scope | 扫描路径 | 说明 |
|------|-------|----------|------|
| `~/.agents/skills/` | `global` | 直接扫描该目录 | 用户全局技能，跨所有工作空间/项目共享 |
| `<workspace>/.tenas/skills/` | `workspace` | `<workspace>/.tenas/skills/` | 工作空间级技能 |
| `<project>/.tenas/skills/` | `project` | `<project>/.tenas/skills/` | 项目级技能，优先级最高 |

**关键区别**：全局技能目录 `~/.agents/skills/` 直接作为 skills 根目录扫描；工作空间和项目技能需要在 `.tenas/skills/` 子目录下。

## 前置元数据格式

SKILL.md 文件以 YAML front matter 开头，系统仅解析 `name` 和 `description` 两个字段：

```markdown
---
name: my-skill-name
description: >
  Use when developing or modifying feature X —
  covers frontend UI, backend API, and database schema
---

# Skill Title

正文内容...
```

### name 字段

- **用途**：技能标识符，用于同名覆盖判断和 `/skill/<name>` 引用
- **格式**：英文小写，连字符分隔（如 `chat-ai-development`）
- **备选**：若未提供，使用文件夹名称作为 fallback
- **匹配**：大小写不敏感（`normalizeSkillName` 统一转小写比较）

### description 字段

- **用途**：在设置面板中展示，帮助用户理解技能适用场景
- **格式**：支持三种 YAML 写法

```yaml
# 单行
description: Simple one-line description

# 折叠多行（推荐，多行合并为单行，空格连接）
description: >
  Use when developing feature X —
  covers frontend and backend

# 字面量多行（保留换行）
description: |
  Line 1
  Line 2
```

- **规范化**：多行描述自动折叠为单行（多个空白字符合并为一个空格）
- **默认值**：若未提供，显示为"未提供"

### 引号处理

前置元数据值支持带引号和不带引号：

```yaml
name: my-skill          # 无引号
name: "my-skill"        # 双引号（自动剥离）
name: 'my-skill'        # 单引号（自动剥离）
```

## 正文结构最佳实践

参照现有技能的标准结构：

```markdown
---
name: <skill-name>
description: >
  <何时使用此技能的简洁说明>
---

# <主标题>

## Overview
<系统架构与数据流概览，一段话概括>

## When to Use
- 场景 1
- 场景 2
- ...

## Architecture
<ASCII 图表或文字描述，展示系统分层和数据流>

## Detailed References
| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [file1.md](file1.md) | 描述 | 何时查阅 |

## Key Files Map
<关键文件树状结构，标注每个文件的用途和行数>

## Skill Sync Policy
| 变更范围 | 需更新的文件 |
|----------|-------------|
| 代码文件变更 | 对应 skill 文件 |
```

## 技能内容注入

AI Agent 消费技能时，`readSkillContentFromPath()` 会自动剥离 front matter，仅返回 `---` 之后的 Markdown 正文。因此：

- front matter 中的 `name`/`description` 仅用于列表展示和搜索匹配
- 正文内容是 Agent 实际读取的指令，应包含完整的开发指南
- 正文中可使用相对路径引用同目录下的支持文档（如 `[detail.md](detail.md)`）

## 技能引用语法

用户在聊天中通过 `/skill/<name>` 语法引用技能：

```
/skill/chat-ai-development
/skill/tenas-skill
```

`SkillSelector.extractSkillNamesFromText()` 从文本中提取所有 `/skill/xxx` 引用，然后按优先级搜索匹配。

## 优先级与覆盖规则

同名技能按以下优先级覆盖（从低到高）：

1. **Global** (`~/.agents/skills/`) — 最低优先级
2. **Workspace** (`<workspace>/.tenas/skills/`)
3. **Parent Project** (`<parent>/.tenas/skills/`) — 从顶层到近层
4. **Project** (`<project>/.tenas/skills/`) — 最高优先级

覆盖逻辑：`loadSkillSummaries` 按优先级从低到高遍历，`project` scope 的技能总是覆盖同名技能；其他 scope 仅在名称首次出现时写入。
