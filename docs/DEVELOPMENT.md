# Development Guide

OpenLoaf 开发规范。适用于核心开发者和外部贡献者。

<strong>简体中文</strong> | <a href="./DEVELOPMENT_en.md">English</a>

## Commit 规范

项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范，通过 [commitlint](https://commitlint.js.org/) 自动校验。

### 格式

```
<type>(<scope>): <subject>
```

### Type（类型）

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

### Scope（作用域）

| Scope | 说明 |
|-------|------|
| `server` | Hono 后端 |
| `web` | Next.js 前端 |
| `desktop` | Electron 桌面应用 |
| `db` | 数据库 schema / Prisma |
| `api` | tRPC 路由类型共享包 |
| `ui` | 组件库 |
| `config` | 共享配置包 |
| `i18n` | 国际化 |
| `ai` | AI 对话 / Agent |
| `email` | 邮件功能 |
| `calendar` | 日历功能 |
| `board` | 看板功能 |
| `tasks` | 任务管理 |
| `auth` | 认证 |
| `editor` | 编辑器 |
| `terminal` | 终端模拟 |
| `deps` | 依赖更新 |
| `ci` | CI/CD |
| `release` | 发布流程 |

### Subject（主题行）

- 小写开头，不加句号
- 祈使语气（"add feature" 而不是 "added feature"）
- 简洁明了，100 字符以内

### 示例

```bash
feat(ai): add streaming response for chat
fix(web): resolve sidebar scroll issue on mobile
refactor(server): extract email service into module
chore(deps): upgrade prisma to v7.4
docs(api): update tRPC router documentation
ci(desktop): add macOS ARM64 build target
```

### 特殊标记

- `[skip ci]` — 仅用于版本 bump commit，跳过 CI 构建

### 自动校验

commitlint 通过 husky `commit-msg` 钩子自动运行。不合规的 commit message 会被拦截。

scope 规则为 warning 级别（建议遵循但不强制拦截），subject 长度为 error 级别（超过 100 字符会被拦截）。

## 分支策略

### 主分支

- `main` — 稳定主分支，所有发布基于此分支

### 工作模式

**核心开发者（Owner）**：可直接在 `main` 上提交，小改动交替进行靠 scope 区分。

**协作者（Contributor）**：Fork → Feature 分支 → PR 到 `main`。

### 分支命名

大功能建议使用独立分支隔离：

```
feature/<scope>-<description>    # 新功能
fix/<scope>-<description>        # Bug 修复
refactor/<scope>-<description>   # 重构
chore/<description>              # 杂项
```

示例：
```
feature/ai-streaming-response
fix/web-sidebar-scroll
refactor/server-email-module
chore/upgrade-prisma
```

## Pull Request 流程

> 多人协作时启用。一人开发阶段可直接在 main 上提交。

### 要求

1. PR 标题遵循 Commit 规范格式（`<type>(<scope>): <subject>`）
2. 使用 [PR Template](../.github/PULL_REQUEST_TEMPLATE.md) 填写描述
3. 至少 1 人 approve
4. CI 通过（类型检查 + lint）
5. 使用 **Squash Merge** 保持历史整洁

### Code Review 要点

- 代码风格是否符合 Biome 配置
- 类型安全（TypeScript strict mode）
- 组件是否遵循 UI 设计规范
- 数据库变更是否有迁移脚本
- 是否影响 Electron 桌面打包

## Changelog 更新日志规范

每次发布版本时，在 `apps/{app}/changelogs/{version}/` 下创建 `zh.md`（中文）和 `en.md`（英文）两个文件。

### 文件格式

```markdown
---
version: x.y.z
date: YYYY-MM-DD
---

## ✨ 新功能

- 具体描述

## 🐛 问题修复

- 具体描述
```

### 分类与 Emoji

按以下类别组织变更条目。**只列出有内容的分类**，空分类不要出现。

| 分类 | 中文标题 | 英文标题 | 使用场景 |
|------|----------|----------|----------|
| ✨ | `## ✨ 新功能` | `## ✨ New Features` | 全新功能、新增能力 |
| 🚀 | `## 🚀 改进` | `## 🚀 Improvements` | 现有功能增强、优化体验 |
| 🐛 | `## 🐛 问题修复` | `## 🐛 Bug Fixes` | Bug 修复 |
| ⚡ | `## ⚡ 性能优化` | `## ⚡ Performance` | 速度提升、内存优化、包体积缩减 |
| 💄 | `## 💄 界面优化` | `## 💄 UI/UX` | 样式调整、交互改进、动画 |
| 🌐 | `## 🌐 国际化` | `## 🌐 Internationalization` | 翻译、多语言支持 |
| 🔒 | `## 🔒 安全` | `## 🔒 Security` | 安全漏洞修复、权限控制 |
| 🔧 | `## 🔧 重构` | `## 🔧 Refactoring` | 代码重构（无行为变化） |
| 📦 | `## 📦 依赖更新` | `## 📦 Dependencies` | 第三方库升级 |
| 💥 | `## 💥 破坏性变更` | `## 💥 Breaking Changes` | 不兼容变更（需迁移） |
| 🗑️ | `## 🗑️ 废弃` | `## 🗑️ Deprecated` | 即将移除的功能 |

### 分类推荐顺序

```
💥 Breaking Changes（置顶，最重要）
✨ New Features
🚀 Improvements
💄 UI/UX
⚡ Performance
🌐 Internationalization
🐛 Bug Fixes
🔒 Security
🔧 Refactoring
📦 Dependencies
🗑️ Deprecated
```

### 条目书写规则

- 每条以动词开头（中文：新增/优化/修复/重构；英文：Add/Improve/Fix/Refactor）
- 指明受影响的模块或组件
- 简洁清晰，一行描述一个变更
- 关联的多个小改动可合并为一条，用缩进子项列出细节

### 示例

**中文 (`zh.md`)**：

```markdown
---
version: 0.3.0
date: 2026-03-15
---

## ✨ 新功能

- 新增 Claude Code CLI provider 支持
- 新增工具审批模式，支持逐个确认 Agent 工具调用
- 新增 AI Agent 行为测试框架（基于 Promptfoo）

## 🚀 改进

- 优化 AI Agent 能力，新增图标资源
- 任务创建工具重命名为 task-manage

## 💄 界面优化

- 按钮配色语义优化（蓝=主要、琥珀=进行中、紫=审批）
- ChatInputBox 中文占位符文本更新

## 🐛 问题修复

- 修复 PDF 查看器 react-pdf 导入路径
- 修复类型错误：测试文件、UI 文件选择器回调、模型来源类型
```

**英文 (`en.md`)**：

```markdown
---
version: 0.3.0
date: 2026-03-15
---

## ✨ New Features

- Add Claude Code CLI provider support
- Add tool approval mode for per-tool Agent call confirmation
- Add AI Agent behavior testing framework (based on Promptfoo)

## 🚀 Improvements

- Enhance AI Agent capabilities with new icon assets
- Rename task creation tool to task-manage

## 💄 UI/UX

- Refine button color semantics (blue=primary, amber=in-progress, purple=approval)
- Update Chinese placeholder text in ChatInputBox

## 🐛 Bug Fixes

- Fix PDF viewer react-pdf import paths
- Fix type errors in test files, UI file picker callbacks, and model source types
```

## 发布流程

详见版本管理 Skill 文档：
- [发布流程](../.agents/skills/update-version-management/publish-release.md)
- [更新系统](../.agents/skills/update-version-management/update-system.md)

## 开发环境设置

```bash
# 1. 克隆仓库
git clone https://github.com/aspect-apps/OpenLoaf.git
cd OpenLoaf

# 2. 安装依赖
pnpm install

# 3. 初始化数据库
pnpm run db:generate
pnpm run db:push
pnpm run db:seed

# 4. 启动开发服务
pnpm run dev          # Web + Server
pnpm run desktop      # Electron 桌面应用
```

更多命令详见 [CLAUDE.md](../CLAUDE.md) 的「常用命令」部分。
