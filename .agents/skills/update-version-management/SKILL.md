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

> **📍 项目配置文件位置：**
> - **`CLAUDE.md`**（项目根目录）— 项目概述、monorepo 结构、常用命令、架构说明、代码风格规范。所有 AI 助手的全局指导文件。
> - **`AGENTS.md`**（项目根目录）— 编码规则、工具调用模式、tRPC/Prisma 约定、错误处理策略。AI 编写代码时的行为准则。
> - **Skills 目录**：`.agents/skills/` — 各领域专项 skill，按需加载。
>
> **同步规则：** 当 `CLAUDE.md` 或 `AGENTS.md` 中与发布流程、版本管理、CI/CD 相关的内容发生变更时，必须检查并同步更新本 skill。反之，当本 skill 中的流程变更涉及项目全局约定（如新增命令、变更目录结构等），也应同步更新 `CLAUDE.md`。

## Overview

OpenLoaf 的版本发布采用"先发布、后加一"的流程：提交变更 → 打 tag 触发 CI → 构建发布 → 版本号自动加一。每个 app 使用独立 tag，支持各 app 独立版本节奏。

**Desktop 采用 Beta-only 构建策略**：所有新构建只能打 beta tag（`desktop@x.y.z-beta.n`），CI 构建并上传到 R2。生产版本（stable）**只能**从已有的 beta 版本中指定 promote（打 `desktop@x.y.z` tag），不重新构建。禁止直接打 stable tag 触发构建。Server/Web 增量更新沿用旧的 stable/beta 渠道分离机制。

## When to Use

- 用户要求发布新版本、升级版本号、写 changelog
- 用户要求通过 git tag 触发 CI 发布
- 用户要求发布 widget-sdk 或 @openloaf-saas/sdk 到 npm
- 修改 CI 发布 workflow（`.github/workflows/publish-*.yml`）
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
>
> **Desktop 优先规则：** Desktop 打包时已包含最新的 server 和 web。当客户端检测到 Desktop 新版本（`available`/`downloading`/`downloaded`），会自动跳过 server/web 增量更新以节省带宽。因此发布 Desktop 新版本时，确保其打包的 server/web 版本不低于当前 stable manifest 中的版本。

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
- ⚠️ **commit message 禁止包含 `[skip ci]`**：tag 所指向 commit 若含此标记，GitHub Actions 不会被触发

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
- 按 emoji 类别分组，使用项目统一的 changelog 格式（详见 `docs/DEVELOPMENT.md` 的「Changelog 更新日志规范」）
- 分类及顺序：💥 Breaking Changes → ✨ 新功能 → 🚀 改进 → 💄 界面优化 → ⚡ 性能优化 → 🌐 国际化 → 🐛 问题修复 → 🔒 安全 → 🔧 重构 → 📦 依赖更新 → 🗑️ 废弃
- 只列出有内容的分类，空分类不出现
- 生成中文和英文两个版本
- **展示给用户确认后再继续**

在打 tag 前创建 `apps/{app}/changelogs/{currentVersion}/zh.md` 和 `en.md`，格式如下：

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

#### Step 4: 更新 lockfile（如果需要）

如果本地修改了 `package.json`（例如依赖版本变更）但 `pnpm-lock.yaml` 未同步更新：

```bash
pnpm install --no-frozen-lockfile
```

提交 lockfile 更新后再继续后续步骤。

#### Step 5: 打包前执行类型检查并修复

```bash
pnpm check-types
```

- 发现问题必须先修复再继续
- **优先使用 sub agent 代理执行修复**

#### Step 6: 打 git tag 并推送（触发 GitHub Actions 自动构建发布）

Server/Web 的打包和发布完全由 **GitHub Actions CI/CD** 完成。推送 tag 后 CI 自动执行：构建 → 上传到 R2 → 版本号自动加一并提交。

```bash
# 打 tag（轻量 tag 即可，CI 从 tag 名提取版本号）
git tag server-v{currentVersion}
git tag web-v{currentVersion}

# 推送代码和 tag
git push origin main
git push origin server-v{currentVersion} web-v{currentVersion}
```

> **Workflow 文件：** `.github/workflows/publish-server.yml`、`.github/workflows/publish-web.yml`
> **触发条件：** `push.tags: server-v*` / `web-v*`
> **CI 自动完成：** 安装依赖 → 生成 Prisma 客户端 → 构建 → 上传 R2 → 版本号 patch +1 并提交推送

#### Step 7: 等待 GitHub Actions 成功

```bash
# 监控 Actions 运行状态
gh run watch {run_id} --exit-status

# 或查看最近的 runs
gh run list --limit 5
```

- **Actions 成功后**版本号已自动加一（CI 的 `version-bump` job 完成）
- 执行 `git pull` 拉取自动提交的版本号变更

> **⚠️ 重要：** 如果 Actions 失败，需要先修复问题，删除并重新推送 tag，成功后版本号才会自动加一。

#### 如果 GitHub Actions 失败

如果推送 tag 后 GitHub Actions 构建失败：

1. **删除失败 tag：**
   ```bash
   git push origin :refs/tags/server-v{version}
   git push origin :refs/tags/web-v{version}
   git tag -d server-v{version}
   git tag -d web-v{version}
   ```

2. **修复问题并提交：**
   ```bash
   git add ...
   git commit -m "fix: ..."
   git push
   ```

3. **检查 changelog 是否需要更新：** 如果修复涉及用户可感知的变更（不是纯 CI/构建修复），更新 `apps/{app}/changelogs/{version}/en.md`，一并提交。

4. **重新打 tag：**
   ```bash
   git tag server-v{version}
   git tag web-v{version}
   git push origin refs/tags/server-v{version} refs/tags/web-v{version}
   ```

5. **等待 Actions 成功后再执行 Step 7（版本号加一）**

---

### Electron 桌面端发布（Beta-only 构建）

Desktop 采用 **Beta-only 构建策略**：
- **所有新构建只能打 beta tag**（`desktop@x.y.z-beta.n`），CI 执行多平台构建并上传到 R2
- **生产版本（stable）只能从已有 beta promote**：打 `desktop@x.y.z` tag 触发 promote 流程，不重新构建
- **禁止直接打 stable tag 触发构建**：如果 R2 中没有对应的 beta 版本，CI 会报错

CI 通过 tag 格式自动判断模式。

#### Tag 格式（重要）

| 类型 | 格式 | 示例 |
|------|------|------|
| Beta 发布 | `desktop@{x.y.z-beta.n}` | `desktop@0.1.1-beta.1` |
| Stable promote | `desktop@{x.y.z}` | `desktop@0.1.1` |

> ⚠️ 旧格式 `desktop-v*` 已废弃，**必须使用新格式 `desktop@*`**。

#### 完整发布流程

```
Step 1: 开发完成，确认变更已提交到 main

Step 2: 确认 changelog
  - apps/desktop/changelogs/{x.y.z-beta.n}/zh.md
  - apps/desktop/changelogs/{x.y.z-beta.n}/en.md

Step 3: 升版本号并提交（⚠️ commit message 禁止包含 [skip ci]）
  cd apps/desktop && npm version {x.y.z-beta.n} --no-git-tag-version
  git add apps/desktop/package.json
  git commit -m "chore(desktop): bump version to {x.y.z-beta.n}"

  > ⚠️ 此 commit 是 tag 的目标，GitHub Actions 会检查 tag 所指向
  > commit 的 message。若包含 [skip ci] 则 workflow 不会被触发。

Step 4: 打 beta tag → CI 自动构建
  git tag desktop@{x.y.z-beta.n}
  git push origin main --tags

  CI 自动完成：
  ├── determine-mode → mode=beta
  ├── build-prerequisites（编译 server + web）
  ├── build-mac-arm64 / build-mac-x64 / build-windows / build-linux
  ├── publish-to-r2（上传安装包到版本目录 + 写版本 manifest）
  │   desktop/{x.y.z-beta.n}/manifest.json  ← 完整版本信息
  │   desktop/{x.y.z-beta.n}/latest-*.yml
  │   beta/manifest.json                    ← 轻量指针（只有版本号）
  └── create-release（GitHub Release，标记 prerelease=true）

Step 5: Beta 用户安装测试

Step 6: 如有 bug → 打 desktop@{x.y.z-beta.2} → 重复 Step 3-5

Step 7: 测试通过 → 打 stable tag 从 beta promote（不重新构建）
  git tag desktop@{x.y.z}
  git push origin desktop@{x.y.z}

  CI 自动完成：
  ├── determine-mode → mode=promote（检测到 R2 中有 {x.y.z-beta.N}）
  │   ⚠️ 若 R2 中无对应 beta 版本，CI 报错终止（不允许直接构建 stable）
  ├── 跳过所有构建步骤
  ├── promote-to-stable（scripts/promote-desktop.mjs）
  │   desktop/{x.y.z}/manifest.json  ← redirect 文件（含 redirectTo 字段）
  │   desktop/stable/latest-*.yml    ← 复制自 beta 版本目录（electron-updater feed URL 指向此处）
  │   desktop/latest-*.yml           ← 向后兼容旧版客户端（<= v0.2.4-beta.2）
  │   stable/manifest.json           ← 轻量指针更新
  ├── create-release（GitHub Release，正式版）
  └── version-bump（三个 app 版本号 +1）
```

#### CI 两种模式

| mode | 触发条件 | 构建 | promote | version-bump |
|------|---------|------|---------|-------------|
| `beta` | tag 含 `-beta` | ✅ | ❌ | ❌ |
| `promote` | stable tag（R2 中必须有对应 beta 版本） | ❌（跳过） | ✅ | ✅ |

> ⚠️ 打 stable tag 时 R2 中必须有对应的 beta 版本，否则 CI 报错。不支持直接打 stable tag 触发构建。

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

#### Tag 失败后的恢复

```bash
# 1. 删除远端和本地 tag
git push origin :refs/tags/desktop@{version}
git tag -d desktop@{version}

# 2. 修复问题，提交并推送
git add ... && git commit -m "fix: ..." && git push origin main

# 3. 重新打 tag
git tag desktop@{version}
git push origin desktop@{version}
```

#### CI Workflow 关键配置

- **workflow 文件**：`.github/workflows/publish-desktop.yml`
- **触发条件**：`push.tags: desktop@*` 或 `workflow_dispatch`
- **Web 构建环境变量**（NEXT_PUBLIC_* 在构建时内联）：
  ```yaml
  NEXT_PUBLIC_SERVER_URL: http://127.0.0.1:23333
  NEXT_PUBLIC_OPENLOAF_SAAS_URL: https://openloaf.hexems.com
  NEXT_PUBLIC_UPDATE_BASE_URL: https://r2-openloaf-update.hexems.com
  ```
- **`dist.mjs`** 自动添加 `--publish=never` 阻止 electron-builder 自动发布；支持 `--beta[=N]` 参数临时将版本号改为 `x.y.z-beta.N` 打包（打包后自动恢复，用于本地测试自动更新）
- **Linux 仅构建 AppImage**（`package.json` 中 `build.linux.target: ["AppImage"]`）
- **publish-to-r2 条件**：允许部分平台跳过（skipped），但任一平台失败则阻止发布

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
| Server 增量发布 | `git tag server-v{version} && git push origin server-v{version}` |
| Web 增量发布 | `git tag web-v{version} && git push origin web-v{version}` |
| Desktop beta 发布 | `git tag desktop@{x.y.z-beta.n} && git push origin desktop@{x.y.z-beta.n}` |
| Desktop stable promote | `git tag desktop@{x.y.z} && git push origin desktop@{x.y.z}` |
| widget-sdk npm 发布 | `cd packages/widget-sdk && pnpm version patch && pnpm publish --no-git-checks` |
| @openloaf-saas/sdk 更新 | 见下方「@openloaf-saas/sdk 依赖管理」章节 |
| 版本号加一（patch） | `npm version patch --no-git-tag-version` |
| 版本号加一（minor） | `npm version minor --no-git-tag-version` |
| Beta 版本号 | `x.y.z-beta.n`（desktop 专用，server/web 也支持） |
| 本地打包 beta 测试 | `pnpm run dist:mac -- --beta=2`（临时改为 x.y.z-beta.2，打包后自动恢复） |

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| Desktop 用旧格式 `desktop-v*` 打 tag | CI 不触发 | 必须用 `desktop@{version}` 格式 |
| 直接打 stable tag 跳过 beta | CI 报错终止（R2 中无 beta 版本可 promote） | 必须先打 `desktop@{x.y.z-beta.1}`，测试通过再打 `desktop@{x.y.z}` promote |
| 未打 app 前缀 tag | 下次发布 `git describe --match` 找不到上次发布点 | 始终为每个发布的 app 打前缀 tag |
| 未等 GitHub Actions 完成就继续 | 发布不完整，版本号未自动加一 | 用 `gh run watch` 等 Actions 成功后再 `git pull` |
| 发布前先改版本号 | 版本号与发布产物不一致 | 先发布，CI 自动加一 |
| 试图在本地手动打包发布 | 绕过 CI，产物不一致 | 通过 git tag 触发 GitHub Actions |
| commit 范围未加路径过滤 | changelog 包含不相关的变更 | 使用 `-- apps/{app}/ packages/` 过滤 |
| SDK 混淆后 dev 编译挂起 | Turbopack 无限卡住 | 见「@openloaf-saas/sdk 依赖管理」排查步骤 |
| Tag 所在 commit 包含 `[skip ci]` | CI 不会被触发 | commit 消息不要包含 `[skip ci]` |
| Lockfile 未更新就推送 tag | CI 构建失败 `ERR_PNPM_OUTDATED_LOCKFILE` | 打包前先运行 `pnpm install --no-frozen-lockfile` 提交后再推送 tag |
| Desktop 打包的 server/web 落后于 stable manifest | Desktop 更新期间增量更新被跳过，用户暂时拿不到最新修复 | 发布 Desktop 前先确保其打包版本 ≥ stable manifest 中的版本 |
| Beta 用户 `updateChannel` 未设为 `beta` | Electron feed URL 指向 `desktop/stable/`，找不到 beta 更新 | 确保 beta 用户的 `~/.openloaf/.settings.json` 中 `updateChannel: "beta"` |
| Electron feed URL 不含渠道路径 | electron-updater 请求 `desktop/latest-mac.yml`（根目录），R2 上可能不存在或指向旧版本 | `resolveElectronFeedUrl()` 必须返回 `${base}/desktop/${channel}` |

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
```

---

## Detailed References

| 文件 | 查阅时机 |
|------|----------|
| [publish-release.md](publish-release.md) | 执行 Release Workflow、修改发布脚本、配置 R2 环境变量、了解 changelog 格式细节、R2 目录结构 |
| [update-system.md](update-system.md) | 修改更新检查/下载/校验/安装逻辑、调试崩溃回滚、修改 IPC 通道、修改 manifest 结构、两步读取协议 |
