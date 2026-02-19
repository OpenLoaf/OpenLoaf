---
name: update-version-management
description: >
  Use when the user wants to release a new version, bump versions, publish
  updates, or create changelogs for server/web/electron apps.
  Also use when publishing npm packages (widget-sdk), modifying update-related
  code: publish scripts, manifest structure, incremental update logic, crash
  rollback, or update UI components.
---

# Update & Version Management

## Overview

Tenas 的版本发布采用“先发布、后加一”的流程：提交变更 → 直接打包并更新 → 发布成功后打 git tag → 发布完成后版本号自动加一并提交。这样每次代码改动都在新版本上进行，不需要再手动标记“是否改过代码”。每个 app 使用独立 tag（`server-v0.1.1`、`web-v0.1.2`、`electron-v1.0.0`），通过 `git describe --match "{app}-v*"` 定位上次发布点，支持各 app 独立版本节奏。

## When to Use

- 用户要求发布新版本、升级版本号、写 changelog
- 用户要求运行 publish-update 或 dist:production
- 用户要求发布 widget-sdk 到 npm
- 修改发布脚本（publish-update.mjs）、共享工具（publishUtils.mjs）
- 修改更新检查/下载/校验/安装逻辑、manifest 结构
- 修改渠道管理（stable/beta）、崩溃回滚
- 修改 AutoUpdateGate 或 AboutTenas 更新 UI

**不适用：** 普通功能开发、bug 修复（除非涉及上述更新系统代码）

---

## 发布范围判断

用户要求发布时，先根据本次变更内容判断需要发布哪些 app：

### 仅 Server/Web 增量更新（不需要发布 Electron）

- 业务逻辑、UI 组件、页面变更
- tRPC 路由、API 接口变更
- 数据库 schema 变更
- AI 功能、编辑器、协作等应用层变更
- 样式、文案、配置项调整

### 需要同时发布 Electron 本体

- 主进程代码变更（`apps/desktop/src/main/`）
- Preload 脚本变更（`apps/desktop/src/preload/`）
- IPC 通道新增或修改
- 原生功能变更（窗口管理、托盘、菜单、系统通知、快捷键）
- Electron 或原生依赖版本升级（electron、electron-builder 等）
- 增量更新系统本身的逻辑变更（下载、校验、回滚、路径解析）
- `extraResources` 配置变更
- 打包/签名/公证配置变更

> **原则：** Server/Web 通过增量更新热替换，不需要用户重新安装。Electron 本体更新需要用户下载安装包，成本高，仅在必要时发布。

---

## Release Workflow（版本发布流程）

当用户要求发布新版本时，**严格按以下步骤顺序执行**：

### Step 1: 提交未暂存的变更

```bash
git status
```

- 有未提交变更 → 总结内容，`git add -A && git commit -m "<summary>" && git push`
- 工作区干净 → 跳过

### Step 2: 通过 git tag 定位上次发布点（用于生成发布说明）

对每个要发布的 app（`server`/`web`/`electron`）：

```bash
git describe --match "{app}-v*" --abbrev=0
# 例：git describe --match "web-v*" --abbrev=0 → web-v0.1.1
```

如果没有找到 tag（首次发布），用 `git log --oneline -20` 让用户确认范围。

### Step 2.5: 未明确发布范围时，自动分析改动范围并确认

如果用户没有特别说明要发布哪些服务，先自动分析上个版本到当前的改动范围，并询问是否需要推送对应服务：

```bash
# server
git log server-v{lastVersion}..HEAD --oneline --no-merges -- apps/server/ packages/
# web
git log web-v{lastVersion}..HEAD --oneline --no-merges -- apps/web/ packages/
# desktop
git log electron-v{lastVersion}..HEAD --oneline --no-merges -- apps/desktop/ packages/
```

- 若某个服务无改动，明确标记为“无变更”
- 若有改动，列出简要变更并**询问用户是否需要推送该服务**

### Step 3: 收集并总结 commit 历史（可选但推荐）

```bash
git log {app}-v{lastVersion}..HEAD --oneline --no-merges -- apps/{app}/ packages/
```

- 使用路径过滤（`-- apps/{app}/ packages/`）只看该 app 相关的变更
- `packages/` 包含共享代码（db、ui、api、config），变更可能影响所有 app
- 按类别分组（新功能、修复、改进等）
- 生成中文和英文两个版本
- **展示给用户确认后再继续**

可选：如需维护 changelog，请在打 tag 前创建 `apps/{app}/changelogs/{currentVersion}/zh.md` 和 `en.md`。

**Changelog front matter 格式：**

```markdown
---
version: {currentVersion}
date: {YYYY-MM-DD}
---

## 新功能
- ...

## 修复
- ...
```

### Step 4: 打包前执行类型检查并修复

```bash
pnpm check-types
```

- 发现问题必须先修复再继续
- **优先使用 sub agent 代理执行修复**

### Step 5: 直接打包并更新（使用当前版本号）

按发布范围执行（publish-update 内含打包与上传）：

```bash
cd apps/server && pnpm run publish-update
cd apps/web && pnpm run publish-update
```

Electron 本体发布：

```bash
cd apps/desktop && pnpm run dist:production
```

**如果任何命令失败，立即停止，报告错误，不继续后续步骤。**

> 说明：当前版本号用于本次发布，不做提前升版本号。

### Step 6: 发布成功后打 git tag 并推送

为本次实际发布的 app 打 tag（tag 指向当前发布的 commit）：

```bash
git tag -a server-v{currentVersion} -m "release: server@{currentVersion}"
git tag -a web-v{currentVersion} -m "release: web@{currentVersion}"
git tag -a electron-v{currentVersion} -m "release: electron@{currentVersion}"
git push && git push origin --tags
```

### Step 7: 发布完成后版本号自动加一并提交（开始下一版本开发）

1. **询问用户** patch/minor/major 或具体版本号（通常是 patch）
2. 更新 package.json：
   ```bash
   cd apps/{app} && npm version {type} --no-git-tag-version
   ```
3. 创建下一版本的 changelog 目录（可选）：
   ```bash
   mkdir -p apps/{app}/changelogs/{nextVersion}
   ```
4. 提交并推送：
   ```bash
   git add -A
   git commit -m "chore: bump {app} to {nextVersion}"
   git push
   ```

**Tag 命名规则：** `{app}-v{version}`（如 `server-v0.1.2`、`web-v0.1.3`、`electron-v1.0.0`）。同一个 commit 可挂多个 tag。只为本次实际发布的 app 打 tag。

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| Server 增量发布 | `cd apps/server && pnpm run publish-update` |
| Web 增量发布 | `cd apps/web && pnpm run publish-update` |
| Electron 本体发布 | `cd apps/desktop && pnpm run dist:production` |
| widget-sdk npm 发布 | `cd packages/widget-sdk && pnpm version patch && pnpm publish --no-git-checks` |
| 版本号加一（发布后） | `npm version patch --no-git-tag-version` |
| 版本号加一（minor） | `npm version minor --no-git-tag-version` |
| 版本号加一（major） | `npm version major --no-git-tag-version` |
| Beta 版本号 | `x.y.z-beta.n`（自动归入 beta 渠道） |

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| 未打 app 前缀 tag | 下次发布 `git describe --match` 找不到上次发布点 | 始终为每个发布的 app 打 `{app}-v{version}` tag |
| 未等 publish 完成就继续 | 发布不完整，manifest 未更新 | 等每个命令成功后再继续 |
| 发布前先改版本号 | 版本号与发布产物不一致 | 先发布，发布后再加一 |
| 未询问用户就决定版本号 | 版本号不符合预期 | 始终先询问 patch/minor/major |
| commit 范围未加路径过滤 | changelog 包含不相关的变更 | 使用 `-- apps/{app}/ packages/` 过滤 |

---

## Widget SDK npm 发布流程

`@tenas-ai/widget-sdk` 是独立发布到 npm 的公开包，与 server/web/electron 的 R2 增量发布流程无关。

### 前置条件

- npm 已登录且有 `@tenas-ai` org 的发布权限
- `~/.npmrc` 中已配置 Granular Access Token（需开启 bypass 2FA）

### 发布步骤

```bash
cd packages/widget-sdk

# 1. 升版本号（patch/minor/major）
pnpm version patch

# 2. 发布（prepublishOnly 自动触发 build）
pnpm publish --no-git-checks

# 3. 回到根目录提交版本变更
cd ../..
git add packages/widget-sdk/package.json
git commit -m "chore: release @tenas-ai/widget-sdk v$(node -p "require('./packages/widget-sdk/package.json').version")"
git push
```

### 构建说明

- 构建配置：`tsconfig.build.json`（独立于 monorepo，不继承 base config）
- 构建命令：`pnpm run build` → `rm -rf dist && tsc -p tsconfig.build.json`
- 产物：`dist/index.js` + `dist/index.d.ts` + `dist/index.d.ts.map`
- `exports` 双入口：npm 消费者走 `import` → `dist/`；monorepo 内部走 `default` → `src/index.ts`

### 验证

```bash
# 确认发布成功
npm view @tenas-ai/widget-sdk version
# 或访问 https://www.npmjs.com/package/@tenas-ai/widget-sdk
```

---

## Detailed References

| 文件 | 查阅时机 |
|------|----------|
| [publish-release.md](publish-release.md) | 执行 Release Workflow、修改发布脚本、配置 R2 环境变量、了解 changelog 格式细节 |
| [update-system.md](update-system.md) | 修改更新检查/下载/校验/安装逻辑、调试崩溃回滚、修改 IPC 通道、修改 manifest 结构 |
