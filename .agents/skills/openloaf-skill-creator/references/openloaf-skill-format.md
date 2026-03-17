# OpenLoaf Skill 文件格式规范

本文档描述 OpenLoaf Skill 的文件格式，从平台用户视角说明每个文件的作用和字段规范。

---

## 目录结构

```
skill-name/                  ← 小写 kebab-case 命名
├── SKILL.md                 ← 必需：核心指令（frontmatter + Markdown）
├── openloaf.json            ← 必需：OpenLoaf UI 元数据
├── LICENSE.txt              ← 推荐：许可证文件
├── agents/                  ← 可选：子 Agent 指令文件
│   └── *.md
├── scripts/                 ← 可选：可执行脚本（Python/Shell）
│   └── *.py
├── references/              ← 可选：详细参考文档
│   └── *.md
└── assets/                  ← 可选：模板、图标、字体等资源
    └── *
```

**命名规则**：目录名必须小写 kebab-case（如 `my-skill`，不能是 `MySkill` 或 `my_skill`）。

---

## SKILL.md

### Frontmatter 字段

```yaml
---
name: skill-name          # 必需：小写 kebab-case，最长 64 字符
description: >            # 必需：触发条件 + 功能描述，最长 1024 字符
  描述这个 skill 的用途，以及何时应该触发。
  包含用户可能说的话（中英文都行）。
license: Complete terms in LICENSE.txt   # 可选
compatibility: Requires Python 3.8+      # 可选：依赖说明
---
```

**Description 写作要点**：
- description 是主要触发机制——Claude 通过它判断是否调用 skill
- 要包含"什么情况下使用"，不仅是"能做什么"
- 适当"推动性"：提到用户可能表达的各种说法，包括中文和英文

### Markdown 正文

正文是给 AI 看的指令，使用 Markdown 格式。建议控制在 500 行以内。

**Progressive Disclosure 三层架构**：
1. **Metadata**（name + description）：始终在上下文中（~100 词）
2. **SKILL.md 正文**：触发时加载（≤500 行理想）
3. **references/ 等资源**：按需加载（无限制）

超过 500 行时，在正文中加指针指向 references/ 下的详细文档。

---

## openloaf.json

每个 skill 文件夹**必须**包含此文件，供 OpenLoaf UI 显示 skill 信息。

### 完整字段说明

```json
{
  "name": "技能显示名称",
  "description": "一句话中文描述，显示在 UI 中",
  "icon": "🔧",
  "version": "0.1.0",
  "sourceLanguage": "zh-CN",
  "targetLanguage": "zh-CN",
  "translatedAt": "2025-01-01T00:00:00.000Z",
  "colorIndex": 0
}
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | ✅ | UI 显示名称（可用中文） |
| `description` | string | ✅ | 简短描述（一句话） |
| `icon` | string | ✅ | Emoji 图标，不能为空 |
| `version` | string | ✅ | 语义化版本号（如 `0.1.0`） |
| `sourceLanguage` | string | 可选 | 原始语言代码 |
| `targetLanguage` | string | 可选 | 目标语言代码 |
| `translatedAt` | string | 可选 | ISO 8601 时间戳 |
| `colorIndex` | integer | 可选 | 0-7 之间的颜色索引（见下表） |

### colorIndex 颜色表

| 值 | 颜色 | 适用场景示例 |
|----|------|------------|
| 0 | 青色（Cyan） | 工具类、通用能力 |
| 1 | 紫色（Purple） | AI / 智能 / 创作 |
| 2 | 琥珀（Amber） | 进行中、警告、效率 |
| 3 | 天蓝（Sky） | 数据、分析、云 |
| 4 | 玫瑰（Rose） | 设计、创意、媒体 |
| 5 | 祖母绿（Emerald） | 完成、健康、绿色 |
| 6 | 靛蓝（Indigo） | 代码、开发、深度 |
| 7 | 酸橙（Lime） | 活力、新鲜、轻量 |

---

## Skill 作用域

OpenLoaf 有三层 Skill 作用域，优先级由低到高：

```
~/.agents/skills/                          ← 全局（所有项目可见）
{parent-project}/.agents/skills/           ← 父项目（子项目继承）
.agents/skills/                            ← 当前项目（最高优先级）
```

同名 skill 后层完全覆盖前层（不合并）。

**选择原则**：
- 项目特有知识（API、业务逻辑）→ `.agents/skills/`（最常用）
- 多个子项目共用 → 父项目 `.agents/skills/`
- 通用能力（设计规范、写作风格）→ `~/.agents/skills/`

---

## 测试与验证

**验证 skill 结构**：
```bash
python .agents/skills/openloaf-skill-creator/scripts/quick_validate.py .agents/skills/my-skill
```

**在 OpenLoaf UI 中查看**：
打开 OpenLoaf Settings → Skills 面板，确认 skill 出现在列表中，显示正确的名称和图标。

**测试触发**：
在 OpenLoaf AI 对话中，用与 SKILL.md description 匹配的语句发起对话，观察 AI 是否正确调用该 skill。

---

## 参考

- `references/schemas.md` — evals.json、grading.json 等 JSON schema
- `agents/grader.md` — 如何评估测试断言
- `agents/analyzer.md` — 如何分析 benchmark 结果
