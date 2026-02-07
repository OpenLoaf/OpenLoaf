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

Tenas 的版本发布通过 6 步流程完成：提交变更 → 读取上次 commitId → 收集 commit → 升版本 + 写 changelog → publish → 提交发布。changelog front matter 中的 `commitId` 是串联两次发布的关键——它记录上次发布时的 git commit，下次发布时用它确定 commit 范围。

## When to Use

- 用户要求发布新版本、升级版本号、写 changelog
- 用户要求运行 publish-update 或 dist:production
- 修改发布脚本（publish-update.mjs）、共享工具（publishUtils.mjs）
- 修改更新检查/下载/校验/安装逻辑、manifest 结构
- 修改渠道管理（stable/beta）、崩溃回滚
- 修改 AutoUpdateGate 或 AboutTenas 更新 UI

**不适用：** 普通功能开发、bug 修复（除非涉及上述更新系统代码）

---

## Release Workflow（版本发布流程）

当用户要求发布新版本时，**严格按以下步骤顺序执行**：

### Step 1: 提交未暂存的变更

```bash
git status
```

- 有未提交变更 → 总结内容，`git add -A && git commit -m "<summary>" && git push`
- 工作区干净 → 跳过

### Step 2: 读取当前版本与上次发布的 commitId

对每个要发布的 app（`server`/`web`/`electron`）：

1. 读取 `apps/{app}/package.json` → `version` 字段 → `currentVersion`
2. 读取 `apps/{app}/changelogs/{currentVersion}/zh.md` → front matter → `commitId`

如果 changelog 不存在或无 `commitId`，用 `git log --oneline -20` 让用户确认范围。

### Step 3: 收集并总结 commit 历史

```bash
git log {commitId}..HEAD --oneline --no-merges
```

- 按类别分组（新功能、修复、改进等）
- 生成中文和英文两个版本
- **展示给用户确认后再继续**

### Step 4: 更新版本号并创建 changelog

1. **询问用户** patch/minor/major 或具体版本号
2. 更新 package.json：
   ```bash
   cd apps/{app} && npm version {type} --no-git-tag-version
   ```
3. 获取 commitId：`git rev-parse HEAD`
4. 创建 `apps/{app}/changelogs/{newVersion}/zh.md` 和 `en.md`

**Changelog front matter 格式：**

```markdown
---
version: {newVersion}
date: {YYYY-MM-DD}
commitId: {git rev-parse HEAD 的完整 40 字符 hash}
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

Electron 本体发布：`cd apps/electron && pnpm run dist:production`

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
git push
```

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| Server 增量发布 | `cd apps/server && pnpm run publish-update` |
| Web 增量发布 | `cd apps/web && pnpm run publish-update` |
| Electron 本体发布 | `cd apps/electron && pnpm run dist:production` |
| 升 patch 版本 | `npm version patch --no-git-tag-version` |
| 升 minor 版本 | `npm version minor --no-git-tag-version` |
| 升 major 版本 | `npm version major --no-git-tag-version` |
| Beta 版本号 | `x.y.z-beta.n`（自动归入 beta 渠道） |

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| changelog 漏写 `commitId` | 下次发布无法自动确定 commit 范围 | 始终用 `git rev-parse HEAD` 写入 front matter |
| 未等 publish 完成就继续 | 发布不完整，manifest 未更新 | 等每个命令成功后再继续 |
| 未询问用户就决定版本号 | 版本号不符合预期 | 始终先询问 patch/minor/major |
| 用当前 HEAD 作为旧版本 commitId | commit 范围错误 | commitId 必须从上一版本的 changelog 中读取 |

## Detailed References

| 文件 | 查阅时机 |
|------|----------|
| [publish-release.md](publish-release.md) | 执行 Release Workflow、修改发布脚本、配置 R2 环境变量、了解 changelog 格式细节 |
| [update-system.md](update-system.md) | 修改更新检查/下载/校验/安装逻辑、调试崩溃回滚、修改 IPC 通道、修改 manifest 结构 |
