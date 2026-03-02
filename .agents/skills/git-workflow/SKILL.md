---
name: git-workflow
description: >
  This skill should be used when the user asks to "create a branch", "open a PR",
  "merge a branch", "review code", "write a commit message", "create a pull request",
  "set up code review", or mentions Git workflow, branching strategy, collaboration,
  GitHub PR, code review, commit conventions, branch naming, squash merge, or
  multi-person development. Also use when committing code to ensure commit messages
  follow project conventions.
---

# Git Workflow & Collaboration

OpenLoaf 使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范，通过 commitlint 自动校验。项目支持两种工作模式：核心开发者直接在 main 提交，协作者通过 PR 流程贡献代码。

完整规范见 `docs/DEVELOPMENT.md`。

## When to Use

- 提交代码时（确保 commit message 格式正确）
- 创建分支、切换分支、分支命名
- 创建或审查 Pull Request
- 多人协作、Code Review 流程
- 合并策略（squash merge、rebase）
- GitHub 相关操作（PR、Issue、分支保护）

**不适用：** 版本发布、打 tag、publish-update — 这些由 `update-version-management` skill 处理。

## Commit Message 规范

### 格式

```
<type>(<scope>): <subject>
```

### Type 列表

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变行为） |
| `perf` | 性能优化 |
| `chore` | 构建、工具、依赖等杂项 |
| `docs` | 仅文档变更 |
| `style` | 格式调整（无逻辑变更） |
| `test` | 添加或更新测试 |
| `ci` | CI/CD 配置变更 |
| `revert` | 回退提交 |

### Scope 列表

`server`, `web`, `desktop`, `db`, `api`, `ui`, `config`, `i18n`, `ai`, `email`, `calendar`, `board`, `tasks`, `auth`, `editor`, `terminal`, `deps`, `ci`, `release`

### Subject 规则

- 小写开头，不加句号
- 祈使语气（"add feature" 而不是 "added feature"）
- 100 字符以内（commitlint 强制校验）

### 校验级别

| 规则 | 级别 | 说明 |
|------|------|------|
| type 必填 | error | 缺少 type 会被拦截 |
| subject 必填 | error | 缺少 subject 会被拦截 |
| subject ≤ 100 字符 | error | 超长会被拦截 |
| scope 建议填写 | warning | 缺少 scope 仅警告，不拦截 |
| scope 必须在枚举内 | warning | 非标准 scope 仅警告 |

### 示例

```bash
# 正确
feat(ai): add streaming response for chat
fix(web): resolve sidebar scroll issue on mobile
refactor(server): extract email service into module
chore(deps): upgrade prisma to v7.4

# 错误（会被拦截）
update stuff                    # 缺少 type 和 scope
feat: Add New Feature.          # 大写开头 + 句号（conventional commit lint）
```

### 特殊标记

- `[skip ci]` — 仅用于版本 bump commit

## 分支策略

### 工作模式

**核心开发者（Owner）**：可直接在 `main` 上提交。小改动交替进行靠 scope 区分即可。

**协作者（Contributor）**：Fork → Feature 分支 → PR 到 `main`。

### 分支命名约定

大功能或多人协作时，使用独立分支隔离：

```
feature/<scope>-<description>    # 新功能
fix/<scope>-<description>        # Bug 修复
refactor/<scope>-<description>   # 重构
chore/<description>              # 杂项
```

示例：`feature/ai-streaming-response`、`fix/web-sidebar-scroll`

## Pull Request 流程

> 多人协作时启用。一人开发阶段可直接在 main 上提交。

### PR 要求

1. 标题遵循 Commit 规范格式（`<type>(<scope>): <subject>`）
2. 使用 PR Template（`.github/PULL_REQUEST_TEMPLATE.md`）填写描述
3. 至少 1 人 approve
4. CI 通过（类型检查 + lint）
5. 使用 **Squash Merge** 保持历史整洁

### Code Review 关注点

- 代码风格是否符合 Biome 配置
- 类型安全（TypeScript strict mode）
- 组件是否遵循 UI 设计规范
- 数据库变更是否有迁移脚本
- 是否影响 Electron 桌面打包

## Changelog 更新日志

每次发布时创建 `apps/{app}/changelogs/{version}/zh.md` 和 `en.md`。使用 emoji 分类标题：

| Emoji | 中文 | 英文 |
|-------|------|------|
| ✨ | 新功能 | New Features |
| 🚀 | 改进 | Improvements |
| 🐛 | 问题修复 | Bug Fixes |
| ⚡ | 性能优化 | Performance |
| 💄 | 界面优化 | UI/UX |
| 🌐 | 国际化 | Internationalization |
| 🔒 | 安全 | Security |
| 🔧 | 重构 | Refactoring |
| 📦 | 依赖更新 | Dependencies |
| 💥 | 破坏性变更 | Breaking Changes |
| 🗑️ | 废弃 | Deprecated |

完整格式和示例见 `docs/DEVELOPMENT.md` 的「Changelog 更新日志规范」章节。

## 关键文件

| 文件 | 说明 |
|------|------|
| `docs/DEVELOPMENT.md` | 完整开发规范文档 |
| `commitlint.config.mjs` | commitlint 配置（type/scope 枚举） |
| `.husky/commit-msg` | husky 钩子，自动运行 commitlint |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 模板 |
| `.github/CONTRIBUTING.md` | 贡献指南 |

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| commit message 不带 type | 被 commitlint 拦截 | 始终使用 `type(scope): subject` 格式 |
| scope 使用非枚举值 | 警告（不拦截） | 使用已定义的 scope 列表 |
| subject 超过 100 字符 | 被 commitlint 拦截 | 精简描述，详情放 commit body |
| PR 直接 merge 不 squash | 历史混乱，难以回溯 | 使用 Squash Merge |
| 分支命名不规范 | 难以识别目的 | 使用 `feature/`、`fix/`、`refactor/` 前缀 |
