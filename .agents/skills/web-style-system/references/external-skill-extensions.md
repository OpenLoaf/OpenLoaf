# External Skill Extensions (Optional)

本文件提供“可选扩展”，不是硬依赖。

原则：

- 优先使用当前仓库已有 skills 完成主流程。
- 仅在需要额外知识覆盖时引入外部 skills。
- 不把外部 skill 作为前置强依赖。

## 1) Internal Skills (Recommended First)

### `skill-development`

用途：

- 维护 skill 结构、frontmatter、触发语句与 progressive disclosure 质量。

### `web-layout-structure`

用途：

- 快速锁定 `apps/web/src/components/layout` 渲染树与状态流。

### `frontend-design`

用途：

- 在 Build Mode 提供可执行的视觉与交互表达建议。

### `web-design-guidelines`

用途：

- 在 Review Mode 做通用 UI/UX 合规检查。

### `find-skills`

用途：

- 查询并安装外部技能扩展。

## 2) External Skills Candidates

以下为可选候选（检索结果）：

- `davila7/claude-code-templates@ui-design-system`
- `figma/mcp-server-guide@create-design-system-rules`
- `wondelai/skills@refactoring-ui`
- `mblode/agent-skills@audit-ui`
- `davila7/claude-code-templates@accessibility-auditor`

## 3) Discovery and Install Commands

检索（示例）：

```bash
NPM_CONFIG_CACHE=/tmp/npm-cache npx -y skills find "ui design system"
NPM_CONFIG_CACHE=/tmp/npm-cache npx -y skills find "tabs layout glassmorphism"
NPM_CONFIG_CACHE=/tmp/npm-cache npx -y skills find "accessibility web ui review"
```

安装（示例）：

```bash
npx skills add davila7/claude-code-templates@ui-design-system -g -y
```

## 4) Usage Policy

- 当仓库内技能可覆盖任务时，不引入外部依赖。
- 当用户明确要求或现有技能不足时，再推荐外部安装。
- 外部 skill 输出需回收为本仓库规范语义，避免风格漂移。
