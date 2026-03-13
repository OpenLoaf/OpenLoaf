# Plan: AI Skill 自动加载机制

## 问题

1. Skill 摘要（name + description + path）已注入 preface，模型能看到
2. 但模型**无法主动加载** skill 完整内容 — 只能用户手动输入 `/skill/NAME`
3. Skill 目录可能包含多文件（scripts/、references/），直接返回所有内容不合理
4. SKILL.md 中使用**相对路径**引用资源，模型需要知道基础目录才能正确访问

## 方案：新增 `load-skill` tool 供 AI 模型调用

### 核心设计

- Tool name: `load-skill`
- 输入: `{ skillName: string }`
- 输出: `{ skillBasePath: string, content: string }` (text 格式)
- 模型根据 preface 中的摘要语义匹配，判断需要时主动调用
- 只返回 SKILL.md 内容 + skillBasePath，其他文件由模型按需用 Read/Bash 访问
- **skillBasePath**: SKILL.md 所在目录的绝对路径，模型用它拼接相对路径

### Tool Result 格式

```
Skill: web-i18n-system
Scope: project
Base Path: /home/user/project/.agents/skills/web-i18n-system/

<skill-content>
... SKILL.md 完整内容 ...
注意：此技能目录下的相对路径（如 scripts/extract.sh）均相对于上述 Base Path。
请使用 Base Path 拼接相对路径来访问技能目录中的资源文件。
</skill-content>
```

### 触发流程

```
用户: "帮我做国际化"
→ 模型看到 preface: "web-i18n-system: 前端国际化开发指南"
→ 模型语义匹配 → 调用 load-skill({ skillName: "web-i18n-system" })
→ tool 返回 SKILL.md + skillBasePath
→ SKILL.md 内容说: "运行 scripts/extract.sh 提取文案"
→ 模型拼接: skillBasePath + "scripts/extract.sh"
→ 模型用 Bash 执行: bash /home/user/project/.agents/skills/web-i18n-system/scripts/extract.sh
```

## 实现步骤

### Step 1: 创建 load-skill tool 定义

**文件**: `apps/server/src/ai/models/cli/loadSkillTool.ts`（新建）

- 定义 tool schema: `{ skillName: z.string() }`
- execute 函数:
  1. 从 requestContext 获取 projectRoot / parentRoots / globalRoot
  2. 调用 `SkillSelector.resolveSkillByName(skillName, roots)`
  3. 计算 `skillBasePath = path.dirname(match.path)`
  4. 返回格式化 text result（包含 skillBasePath + content）
  5. 未找到时返回错误提示

### Step 2: 注册 tool 到 agent toolset

**文件**: `apps/server/src/ai/services/agentFactory.ts`（修改）

- 在 master agent 的 tool 列表中加入 `load-skill`
- 确保 sub-agent 也能使用（如果 sub-agent 需要遵循 skill 指引）

### Step 3: 更新 preface 提示语

**文件**: `apps/server/src/ai/shared/promptBuilder.ts`（修改）

- 修改 `buildSkillsSummarySection()` 中的提示文案
- 从 "需要完整说明请使用工具读取对应 SKILL.md" 改为明确指引：
  "需要完整说明时，调用 load-skill 工具加载技能。技能目录中的相对路径会通过返回的 Base Path 解析。"

### Step 4: 保留用户显式 /skill/NAME 入口

**文件**: `apps/server/src/ai/services/chat/AiExecuteService.ts`（不改）

- 用户输入 `/skill/NAME` 的正则匹配逻辑保持不变
- 这是用户显式触发，与模型通过 tool 自动触发并行存在
- 两个入口最终都是调用 `SkillSelector.resolveSkillByName`

## 不做的事

- ❌ 不新建 skill-search tool（摘要已在上下文中，不需要搜索）
- ❌ 不在 tool result 中返回整个 skill 目录内容（只返回 SKILL.md + basePath）
- ❌ 不修改 skill 发现/解析逻辑（SkillSelector、SkillLoader 不变）
- ❌ 不修改 messageConverter 中的 data-skill 转换逻辑
