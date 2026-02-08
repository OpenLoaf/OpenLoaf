---
name: update-version-management
description: >
  Use when the user wants to release a new version, bump versions, publish
  updates, or create changelogs for server/web/electron apps.
  Also use when modifying update-related code: publish scripts, manifest
  structure, incremental update logic, crash rollback, or update UI components.
---

# Update & Version Management

## Overview

Tenas 的版本发布通过 6 步流程完成：提交变更 → 通过 git tag 定位上次发布 → 收集 commit → 升版本 + 写 changelog → publish → 提交发布并打 tag。每个 app 使用独立的 tag（`server-v0.1.1`、`web-v0.1.2`、`electron-v1.0.0`），通过 `git describe --match "{app}-v*"` 定位上次发布点，支持各 app 独立版本节奏。

## When to Use

- 用户要求发布新版本、升级版本号、写 changelog
- 用户要求运行 publish-update 或 dist:production
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

### Step 2: 通过 git tag 定位上次发布点

对每个要发布的 app（`server`/`web`/`electron`）：

```bash
git describe --match "{app}-v*" --abbrev=0
# 例：git describe --match "web-v*" --abbrev=0 → web-v0.1.1
```

如果没有找到 tag（首次发布），用 `git log --oneline -20` 让用户确认范围。

### Step 3: 收集并总结 commit 历史

```bash
git log {app}-v{lastVersion}..HEAD --oneline --no-merges -- apps/{app}/ packages/
```

- 使用路径过滤（`-- apps/{app}/ packages/`）只看该 app 相关的变更
- `packages/` 包含共享代码（db、ui、api、config），变更可能影响所有 app
- 按类别分组（新功能、修复、改进等）
- 生成中文和英文两个版本
- **展示给用户确认后再继续**

### Step 4: 更新版本号并创建 changelog

1. **询问用户** patch/minor/major 或具体版本号
2. 更新 package.json：
   ```bash
   cd apps/{app} && npm version {type} --no-git-tag-version
   ```
3. 获取当前 HEAD 用于记录（可选）
4. 创建 `apps/{app}/changelogs/{newVersion}/zh.md` 和 `en.md`

**Changelog front matter 格式：**

```markdown
---
version: {newVersion}
date: {YYYY-MM-DD}
---

## 新功能
- ...

## 修复
- ...
```

### Step 5: 运行 publish-update

```bash
cd apps/server && pnpm run publish-update
cd apps/web && pnpm run publish-update
```

Electron 本体发布：`cd apps/desktop && pnpm run dist:production`

**如果任何命令失败，立即停止，报告错误，不继续后续步骤。**

### Step 6: 提交所有发布变更并推送

publish 完成后，将本次发布产生的所有变更（package.json 版本号、changelog 文件等）提交并推送。

**Commit message 格式：** 标题行为版本号，正文为英文 changelog 内容。

```
release: server@{version}, web@{version}

### Server {version}

- Feature A
- Fix B

### Web {version}

- Feature C
- Improvement D
```

单个 app 发布时省略另一个 section。

```bash
git add -A
git commit -m "release: {app}@{newVersion}

{英文 changelog 正文，去掉 front matter}"
# 为每个发布的 app 打独立 tag
git tag -a server-v{newVersion} -m "release: server@{newVersion}"
git tag -a web-v{newVersion} -m "release: web@{newVersion}"
git push && git push origin --tags
```

**Tag 命名规则：** `{app}-v{version}`（如 `server-v0.1.2`、`web-v0.1.3`、`electron-v1.0.0`）。同一个 commit 可挂多个 tag，通过 commit message 体现一起发布的关系。只为本次实际发布的 app 打 tag。

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| Server 增量发布 | `cd apps/server && pnpm run publish-update` |
| Web 增量发布 | `cd apps/web && pnpm run publish-update` |
| Electron 本体发布 | `cd apps/desktop && pnpm run dist:production` |
| 升 patch 版本 | `npm version patch --no-git-tag-version` |
| 升 minor 版本 | `npm version minor --no-git-tag-version` |
| 升 major 版本 | `npm version major --no-git-tag-version` |
| Beta 版本号 | `x.y.z-beta.n`（自动归入 beta 渠道） |

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| 未打 app 前缀 tag | 下次发布 `git describe --match` 找不到上次发布点 | 始终为每个发布的 app 打 `{app}-v{version}` tag |
| 未等 publish 完成就继续 | 发布不完整，manifest 未更新 | 等每个命令成功后再继续 |
| 未询问用户就决定版本号 | 版本号不符合预期 | 始终先询问 patch/minor/major |
| commit 范围未加路径过滤 | changelog 包含不相关的变更 | 使用 `-- apps/{app}/ packages/` 过滤 |

## Detailed References

| 文件 | 查阅时机 |
|------|----------|
| [publish-release.md](publish-release.md) | 执行 Release Workflow、修改发布脚本、配置 R2 环境变量、了解 changelog 格式细节 |
| [update-system.md](update-system.md) | 修改更新检查/下载/校验/安装逻辑、调试崩溃回滚、修改 IPC 通道、修改 manifest 结构 |
