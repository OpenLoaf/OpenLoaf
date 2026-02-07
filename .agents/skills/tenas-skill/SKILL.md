---
name: tenas-skill
description: >
  Use when developing, extending, or debugging the Tenas skill system —
  creating new skills, modifying skill loading/scanning logic, updating
  the settings UI for skill management, or changing how the AI agent
  resolves and consumes skills
---

# Tenas Skill Development

## Overview

Tenas 技能系统由四层构成：**SKILL.md 文件规范**（前置元数据 + Markdown 正文）、**后端扫描加载器**（skillsLoader.ts 递归扫描多级目录）、**AI Agent 技能选择器**（SkillSelector.ts 按优先级解析技能）、**前端设置面板**（SkillsSettingsPanel.tsx 展示/启用/禁用/删除）。技能通过 tRPC API 在前后端之间传递，启用状态持久化在工作空间配置或项目配置中。

## When to Use

- 创建新的 SKILL.md 技能文件
- 修改技能扫描/加载逻辑（新增扫描目录、调整优先级）
- 修改技能前置元数据解析（新增字段、修改格式）
- 修改设置面板中的技能列表 UI（scope 标签、启用/禁用、删除）
- 修改 AI Agent 的技能解析和注入逻辑
- 修改技能启用/禁用的持久化机制（ignoreKey、ignoreSkills）
- 调试技能未加载、未显示、优先级覆盖等问题

## Architecture

```
技能文件存储
├── ~/.agents/skills/<name>/SKILL.md          ← 全局技能 (scope: global)
├── <workspace>/.tenas/skills/<name>/SKILL.md ← 工作空间技能 (scope: workspace)
└── <project>/.tenas/skills/<name>/SKILL.md   ← 项目技能 (scope: project)

加载优先级（从低到高，同名高优先级覆盖低优先级）：
  global → workspace → parent project → project

┌─────────────── 后端 (apps/server) ──────────────────┐
│  skillsLoader.ts                                     │
│    loadSkillSummaries() → 扫描多级目录 → SkillSummary[] │
│    readSkillSummaryFromPath() → 解析 front matter     │
│    readSkillContentFromPath() → 剥离 front matter     │
│                                                       │
│  SkillSelector.ts                                     │
│    resolveSkillByName() → 按优先级搜索技能              │
│    extractSkillNamesFromText() → 从文本提取 /skill/xxx │
│                                                       │
│  settings.ts (tRPC router)                            │
│    getSkills → 列表 + ignoreKey + isEnabled            │
│    setSkillEnabled → 切换启用状态                       │
│    deleteSkill → 删除技能文件夹                         │
├───────────────────────────────────────────────────────┤
│  absSetting.ts (packages/api)                         │
│    skillScopeSchema: "workspace" | "project" | "global"│
│    skillSummarySchema: Zod 类型定义                     │
├─────────────── 前端 (apps/web) ──────────────────────┤
│  SkillsSettingsPanel.tsx                              │
│    技能列表 UI → scope 标签 + 启用开关 + 查看/删除按钮   │
│    tRPC 调用: getSkills / setSkillEnabled / deleteSkill │
└───────────────────────────────────────────────────────┘
```

## Detailed References

| 文件 | 内容 | 查阅时机 |
|------|------|----------|
| [skill-format.md](skill-format.md) | SKILL.md 文件规范、前置元数据格式、目录结构约定、最佳实践 | 创建新技能或修改技能格式 |
| [skill-backend.md](skill-backend.md) | 扫描加载器、SkillSelector、tRPC 路由、ignoreKey 机制、优先级覆盖 | 修改后端技能逻辑 |
| [skill-frontend.md](skill-frontend.md) | 设置面板 UI、scope 标签、启用/禁用/删除交互、文件预览集成 | 修改前端技能管理 UI |

## Key Files Map

```
apps/server/src/ai/agents/masterAgent/
├── skillsLoader.ts             ← 核心扫描加载器 (loadSkillSummaries, parseFrontMatter)
├── masterAgent.ts              ← Agent 创建（技能内容注入点）
└── masterAgentPrompt.zh.md     ← Agent 系统 prompt

apps/server/src/ai/tools/
└── SkillSelector.ts            ← AI 技能选择器 (resolveSkillByName)

apps/server/src/routers/
└── settings.ts                 ← tRPC 路由 (getSkills, setSkillEnabled, deleteSkill)

packages/api/src/routers/
└── absSetting.ts               ← Zod schema (skillScopeSchema, skillSummarySchema)

apps/web/src/components/setting/skills/
└── SkillsSettingsPanel.tsx     ← 前端设置面板 (技能列表 UI)
```

## Skill Sync Policy

**当以下文件发生变更时，应检查并同步更新本 skill：**

| 变更范围 | 需更新的文件 |
|----------|-------------|
| `skillsLoader.ts` 扫描逻辑/类型变更 | skill-backend.md |
| `SkillSelector.ts` 搜索逻辑变更 | skill-backend.md |
| `settings.ts` 技能相关 tRPC 路由变更 | skill-backend.md |
| `absSetting.ts` skillScopeSchema/skillSummarySchema 变更 | skill-backend.md, skill-frontend.md |
| `SkillsSettingsPanel.tsx` UI 变更 | skill-frontend.md |
| SKILL.md 前置元数据格式变更 | skill-format.md |
| 新增技能存储目录 | skill-format.md, skill-backend.md |

**同步规则**: 修改上述文件后，在提交前检查对应 skill 文件是否需要更新。保持 skill 与代码一致。
