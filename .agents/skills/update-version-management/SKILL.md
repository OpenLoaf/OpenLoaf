---
name: update-version-management
description: >
  Use when the user wants to release a new version, bump versions, publish
  updates, or create changelogs for server/web/electron apps.
  Also use when publishing npm packages (widget-sdk, @openloaf-saas/sdk),
  modifying update-related code: publish scripts, manifest structure,
  incremental update logic, crash rollback, or update UI components.
---

# Update & Version Management

> **⚠️ 维护要求：当发布流程、CI/CD 配置、产物命名、R2 目录结构或版本管理策略发生任何变更时，必须同步更新本 skill 的相关文档（SKILL.md、publish-release.md、update-system.md）。** 过时的 skill 会导致 AI 按错误流程操作，造成发布失败或产物不一致。每次修改发布相关代码后，请检查本 skill 是否需要同步更新。

## Overview

OpenLoaf 的版本发布采用"先发布、后加一"的流程：提交变更 → 直接打包并更新 → 发布成功后打 git tag → 发布完成后版本号自动加一并提交。这样每次代码改动都在新版本上进行，不需要再手动标记"是否改过代码"。每个 app 使用独立 tag（`server-v0.1.1`、`web-v0.1.2`、`electron-v1.0.0`），通过 `git describe --match "{app}-v*"` 定位上次发布点，支持各 app 独立版本节奏。

## When to Use

- 用户要求发布新版本、升级版本号、写 changelog
- 用户要求运行 publish-update 或 dist:production
- 用户要求发布 widget-sdk 或 @openloaf-saas/sdk 到 npm
- 修改发布脚本（publish-update.mjs）、共享工具（publishUtils.mjs）
- 修改更新检查/下载/校验/安装逻辑、manifest 结构
- 修改渠道管理（stable/beta）、崩溃回滚
- 修改 AutoUpdateGate 或 AboutOpenLoaf 更新 UI

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

### Server/Web 增量更新

当用户要求发布 Server/Web 新版本时，**严格按以下步骤顺序执行**：

#### Step 1: 提交未暂存的变更

```bash
git status
```

- 有未提交变更 → 总结内容，`git add -A && git commit -m "<summary>" && git push`
- 工作区干净 → 跳过

#### Step 2: 通过 git tag 定位上次发布点（用于生成发布说明）

```bash
git describe --match "{app}-v*" --abbrev=0
# 例：git describe --match "web-v*" --abbrev=0 → web-v0.1.1
```

如果没有找到 tag（首次发布），用 `git log --oneline -20` 让用户确认范围。

#### Step 2.5: 未明确发布范围时，自动分析改动范围并确认

如果用户没有特别说明要发布哪些服务，先自动分析上个版本到当前的改动范围，并询问是否需要推送对应服务：

```bash
# server
git log server-v{lastVersion}..HEAD --oneline --no-merges -- apps/server/ packages/
# web
git log web-v{lastVersion}..HEAD --oneline --no-merges -- apps/web/ packages/
```

- 若某个服务无改动，明确标记为"无变更"
- 若有改动，列出简要变更并**询问用户是否需要推送该服务**

#### Step 3: 收集并总结 commit 历史（可选但推荐）

```bash
git log {app}-v{lastVersion}..HEAD --oneline --no-merges -- apps/{app}/ packages/
```

- 使用路径过滤（`-- apps/{app}/ packages/`）只看该 app 相关的变更
- `packages/` 包含共享代码（db、ui、api、config），变更可能影响所有 app
- 按类别分组（新功能、修复、改进等）
- 生成中文和英文两个版本
- **展示给用户确认后再继续**

可选：如需维护 changelog，请在打 tag 前创建 `apps/{app}/changelogs/{currentVersion}/zh.md` 和 `en.md`。

#### Step 4: 打包前执行类型检查并修复

```bash
pnpm check-types
```

- 发现问题必须先修复再继续
- **优先使用 sub agent 代理执行修复**

#### Step 5: 直接打包并更新（使用当前版本号）

```bash
cd apps/server && pnpm run publish-update
cd apps/web && pnpm run publish-update
```

**如果任何命令失败，立即停止，报告错误，不继续后续步骤。**

#### Step 6: 发布成功后打 git tag 并推送

```bash
git tag -a server-v{currentVersion} -m "release: server@{currentVersion}"
git tag -a web-v{currentVersion} -m "release: web@{currentVersion}"
git push && git push origin --tags
```

#### Step 7: 发布完成后版本号自动加一并提交

1. **询问用户** patch/minor/major 或具体版本号（通常是 patch）
2. 更新 package.json：
   ```bash
   cd apps/{app} && npm version {type} --no-git-tag-version
   ```
3. 提交并推送：
   ```bash
   git add -A
   git commit -m "chore: bump {app} to {nextVersion}"
   git push
   ```

---

### Electron 桌面端发布（CI/CD 自动化）

Electron 桌面端通过 **GitHub Actions CI/CD** 全自动发布，**不再使用本地 `dist:production` 命令**。

#### 发布流程

1. **确认版本号** — `apps/desktop/package.json` 中的 `version` 即为本次发布版本
2. **确认 changelog** — 在 `apps/desktop/changelogs/{version}/` 下创建 `en.md` 和 `zh.md`
3. **提交并推送代码** — 确保所有变更已提交到 `main` 分支
4. **打 tag 触发构建** —
   ```bash
   git tag electron-v{version}
   git push origin electron-v{version}
   ```
5. **CI 自动完成以下所有步骤**（无需人工干预）：
   - `build-prerequisites`：编译 server + web（含 `NEXT_PUBLIC_*` 环境变量）
   - `build-mac-arm64`：macOS Apple Silicon 构建 + 签名 + 公证
   - `build-mac-x64`：macOS Intel 构建（Rosetta 2 交叉编译）+ 签名 + 公证
   - `build-windows`：Windows NSIS 安装包
   - `build-linux`：Linux AppImage
   - `publish-to-r2`：上传所有产物到 Cloudflare R2（自动更新用）
   - `create-release`：创建 GitHub Release，附带安装包和 changelog
   - `version-bump`：自动将 `apps/desktop/package.json` 版本号 +1 并推送

#### CI 产物命名规范

electron-builder 产物（R2 自动更新用）：

| 平台 | 文件名 |
|------|--------|
| macOS ARM64 | `OpenLoaf-{version}-MacOS-arm64.dmg` / `.zip` |
| macOS x64 | `OpenLoaf-{version}-MacOS-x64.dmg` / `.zip` |
| Windows | `OpenLoaf-{version}-Windows-Installer.exe` |
| Linux | `OpenLoaf-{version}-Linux.AppImage` |

GitHub Release 重命名后的用户友好名称：

| 平台 | 文件名 |
|------|--------|
| macOS Apple Silicon | `OpenLoaf-{version}-MacOS.dmg` |
| macOS Intel | `OpenLoaf-{version}-MacOS-Intel.dmg` |
| Windows | `OpenLoaf-{version}-Windows-Installer.exe` |
| Linux | `OpenLoaf-{version}-Linux.AppImage` |

> `.zip` 文件仅用于 electron-updater 自动更新（上传到 R2），不出现在 GitHub Release 中。

#### Tag 构建失败后的恢复

如果 CI 构建失败需要修复后重试：

```bash
# 1. 删除远端和本地 tag
git push origin :refs/tags/electron-v{version}
git tag -d electron-v{version}

# 2. 修复问题，提交并推送
git add ... && git commit -m "fix: ..." && git push origin main

# 3. 重新打 tag 触发构建（注意：commit 消息不能包含 [skip ci]）
git tag electron-v{version}
git push origin electron-v{version}
```

#### CI Workflow 关键配置

- **workflow 文件**：`.github/workflows/publish-desktop.yml`
- **触发条件**：`push.tags: electron-v*` 或 `workflow_dispatch`
- **Web 构建环境变量**（NEXT_PUBLIC_* 在构建时内联）：
  ```yaml
  NEXT_PUBLIC_SERVER_URL: http://127.0.0.1:23333
  NEXT_PUBLIC_OPENLOAF_SAAS_URL: https://openloaf.hexems.com
  NEXT_PUBLIC_UPDATE_BASE_URL: https://r2-openloaf-update.hexems.com
  ```
- **`dist.mjs`** 自动添加 `--publish=never` 阻止 electron-builder 自动发布
- **Linux 仅构建 AppImage**（`package.json` 中 `build.linux.target: ["AppImage"]`）
- **publish-to-r2 条件**：允许部分平台跳过（skipped），但任一平台失败则阻止发布：
  ```yaml
  if: always() && !contains(needs.*.result, 'failure') && contains(needs.*.result, 'success')
  ```

#### 手动触发（workflow_dispatch）

可在 GitHub Actions 页面手动触发，选择要构建的平台：

- `build_mac`：是否构建 macOS（ARM64 + x64）
- `build_windows`：是否构建 Windows
- `build_linux`：是否构建 Linux

手动触发不会创建 GitHub Release 和 version-bump（这两步仅在 tag 推送时执行）。

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| Server 增量发布 | `cd apps/server && pnpm run publish-update` |
| Web 增量发布 | `cd apps/web && pnpm run publish-update` |
| Electron 桌面端发布 | `git tag electron-v{version} && git push origin electron-v{version}` |
| widget-sdk npm 发布 | `cd packages/widget-sdk && pnpm version patch && pnpm publish --no-git-checks` |
| @openloaf-saas/sdk 更新 | 见下方「@openloaf-saas/sdk 依赖管理」章节 |
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
| SDK 混淆后 dev 编译挂起 | Turbopack 无限卡住 | 见「@openloaf-saas/sdk 依赖管理」排查步骤 |
| Tag 所在 commit 包含 `[skip ci]` | CI 不会被触发 | commit 消息不要包含 `[skip ci]` |
| 直接用 `dist:production` 本地发布 Electron | 只有单平台产物 | 通过 git tag 触发 CI 全平台构建 |

---

## @openloaf-saas/sdk 依赖管理

`@openloaf-saas/sdk` 是外部 SaaS SDK 包，从 npm 安装（`^0.1.1`）。

### SDK 更新

当 SDK 发布新版本后，在本仓库执行：

```bash
pnpm update @openloaf-saas/sdk
```

### Turbopack 兼容性约束（关键）

`@openloaf-saas/sdk` 的 npm 发布版本经过代码混淆保护。**混淆配置必须兼容 Turbopack**，否则 Next.js dev 编译会无限挂起（卡在 "○ Compiling ..."）。

**以下 javascript-obfuscator 选项绝对禁止开启：**

| 禁止选项 | 原因 |
|---------|------|
| `controlFlowFlattening` | 生成巨型 while/switch 结构，Turbopack 解析器挂死 |
| `deadCodeInjection` | 虚假代码路径拖慢 bundler 静态分析 |
| `selfDefending` | 反篡改代码在 bundler 变换后触发无限循环 |

### 排查：dev 编译挂起

如果 `pnpm dev` 卡在 "○ Compiling /" 不动，优先检查：

1. `node_modules/@openloaf-saas/sdk/dist/index.js` 是否被重新混淆（检查文件是否包含 `controlFlowFlattening` 特征：巨型 `while(true){switch(...)}`）
2. 临时修复：在 SDK 目录执行 `bun run build`（仅 tsup 构建，不混淆）并复制 `dist/` 到 `node_modules/@openloaf-saas/sdk/dist/`
3. 根本修复：确认 SDK 的 `scripts/obfuscate.mjs` 中上述三个选项为 `false`

### next.config.js 配置

`@openloaf-saas/sdk` 必须在 `transpilePackages` 中：

```js
transpilePackages: ["@openloaf/ui", "@openloaf-saas/sdk"],
```

---

## Widget SDK npm 发布流程

`@openloaf/widget-sdk` 是独立发布到 npm 的公开包，与 server/web/electron 的 R2 增量发布流程无关。

### 前置条件

- npm 已登录且有 `@openloaf` org 的发布权限
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
git commit -m "chore: release @openloaf/widget-sdk v$(node -p "require('./packages/widget-sdk/package.json').version")"
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
npm view @openloaf/widget-sdk version
# 或访问 https://www.npmjs.com/package/@openloaf/widget-sdk
```

---

## Detailed References

| 文件 | 查阅时机 |
|------|----------|
| [publish-release.md](publish-release.md) | 执行 Release Workflow、修改发布脚本、配置 R2 环境变量、了解 changelog 格式细节 |
| [update-system.md](update-system.md) | 修改更新检查/下载/校验/安装逻辑、调试崩溃回滚、修改 IPC 通道、修改 manifest 结构 |
