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

OpenLoaf 的版本发布采用 **"先 bump、后发布"** 的流程：开发者手动 bump 版本号 → 提交 → 打 tag 触发 CI → 构建发布。**CI 不再自动 bump 版本号**，各 app 版本完全由开发者控制。

**版本号规则：**
- **Server/Web**：常规增量更新用 `x.y.z-beta.n`，稳定版用 `x.y.z`
- **Desktop**：beta 用 `x.y.z-beta.n`，stable 用 `x.y.z`（stable 发布后 CI 仅自动 bump desktop 自身的 patch 版本）
- 各 app 版本号独立，互不影响

**Desktop 采用 Beta-only 构建策略**：所有新构建只能打 beta tag（`desktop@x.y.z-beta.n`），CI 构建并上传到 R2。生产版本（stable）通过打 `desktop@x.y.z` tag 触发完整重新构建。

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
- 数据库 schema 变更（需通过 `db:migrate` 生成迁移文件，迁移 SQL 会内嵌到 server.mjs）
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

#### Step 1: 定位发布基准点并分析变更范围

Desktop 打包时已包含最新的 server 和 web 代码。因此**发布基准不是 `server-v*`/`web-v*` tag，而是所有 app tag 中时间最新的那个**（通常是最近的 `desktop@*` tag）。

```bash
# 获取最新的发布基准点
git tag --list "server-v*" "web-v*" "desktop@*" --sort=-creatordate | head -1
# 例：desktop@0.2.5-beta.9
```

然后分析各 app 的变更（已提交 + 未提交）：

```bash
# server 变更
git log {baseline}..HEAD --oneline --no-merges -- apps/server/ packages/
git diff --stat HEAD -- apps/server/ packages/

# web 变更
git log {baseline}..HEAD --oneline --no-merges -- apps/web/ packages/
git diff --stat HEAD -- apps/web/ packages/

# desktop 变更（判断是否需要发布 desktop）
git log {baseline}..HEAD --oneline --no-merges -- apps/desktop/
git diff --stat HEAD -- apps/desktop/
```

- 若某个服务无改动（已提交和未提交都无），明确标记为"无变更"
- 若有改动，列出简要变更并**询问用户是否需要推送该服务**

> **关键规则：无论用户输入什么参数，第一步永远是分析变更范围，再决定发布哪些 app。** 禁止根据参数直接假设发布目标。

#### Step 2: 收集并总结变更内容

```bash
# 已提交的 commit
git log {baseline}..HEAD --oneline --no-merges -- apps/{app}/ packages/
# 未提交的变更
git diff --stat HEAD -- apps/{app}/ packages/
```

- 使用路径过滤（`-- apps/{app}/ packages/`）只看该 app 相关的变更
- `packages/` 包含共享代码（db、ui、api、config），变更可能影响所有 app
- **同时检查未提交的变更**（`git diff --stat HEAD`），未提交内容也是本次发布的一部分
- 按 emoji 类别分组，使用项目统一的 changelog 格式（详见 `docs/DEVELOPMENT.md` 的「Changelog 更新日志规范」）
- 分类及顺序：💥 Breaking Changes → ✨ 新功能 → 🚀 改进 → 💄 界面优化 → ⚡ 性能优化 → 🌐 国际化 → 🐛 问题修复 → 🔒 安全 → 🔧 重构 → 📦 依赖更新 → 🗑️ 废弃
- 只列出有内容的分类，空分类不出现
- **生成英文版 changelog**（用于 annotated tag 内容）
- **展示给用户确认后再继续**

Changelog 作为 **annotated tag** 的内容写入 git tag。格式如下：

```
✨ New Features

- Feature description

🐛 Bug Fixes

- Fix description
```

#### Step 3: 更新 lockfile（如果需要）

如果本地修改了 `package.json`（例如依赖版本变更）但 `pnpm-lock.yaml` 未同步更新：

```bash
pnpm install --no-frozen-lockfile
```

#### Step 4: 执行类型检查（必须在提交之前）

```bash
pnpm check-types
```

- **类型检查必须在 commit 之前执行**，确保推送到 CI 的代码能通过编译
- 发现问题必须先修复再继续
- **优先使用 sub agent 代理执行修复**

#### Step 5: Bump 版本号并提交

**CI 不会自动 bump 版本号**，必须在本地手动 bump 后提交。

```bash
# 确定新版本号（常规更新用 beta，稳定版用不带后缀的）
npm version {newVersion} --no-git-tag-version --prefix apps/server
npm version {newVersion} --no-git-tag-version --prefix apps/web

# 提交所有变更（包括代码改动 + 版本号）
git add -A
git commit -m "feat(server,web): <summary>"
```

- ⚠️ **commit message 禁止包含 `[skip ci]`**：tag 所指向 commit 若含此标记，GitHub Actions 不会被触发
- 版本号命名：常规增量更新用 `x.y.z-beta.n`，稳定版用 `x.y.z`

#### Step 6: 打 git tag 并推送（触发 GitHub Actions 自动构建发布）

Server/Web 的打包和发布完全由 **GitHub Actions CI/CD** 完成。推送 tag 后 CI 自动执行：构建 → 上传到 R2。

```bash
# 打 annotated tag（英文 changelog 作为 tag message）
git tag -a server-v{version} -m "$(cat <<'EOF'
changelog content here
EOF
)"
git tag -a web-v{version} -m "$(cat <<'EOF'
changelog content here
EOF
)"

# 推送代码和 tag
git push origin main
git push origin server-v{version} web-v{version}
```

> **Workflow 文件：** `.github/workflows/publish-server.yml`、`.github/workflows/publish-web.yml`
> **触发条件：** `push.tags: server-v*` / `web-v*`
> **CI 自动完成：** 安装依赖 → 生成 Prisma 客户端 → 构建 → 上传 R2（不再自动 bump 版本号）

#### Step 7: 等待 GitHub Actions 成功

```bash
# 监控 Actions 运行状态
gh run list --limit 5
```

- CI 成功即发布完成，无需 `git pull`（CI 不再自动提交）

> **⚠️ 重要：** 如果 Actions 失败，需要先修复问题，删除并重新推送 tag。

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

3. **重新打 tag 并推送：**
   ```bash
   git tag -a server-v{version} -m "changelog content"
   git tag -a web-v{version} -m "changelog content"
   git push origin server-v{version} web-v{version}
   ```

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
  npm version {x.y.z-beta.n} --no-git-tag-version --prefix apps/desktop
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

Step 7: 测试通过 → 发布 stable 版本（重新构建）
  npm version {x.y.z} --no-git-tag-version --prefix apps/desktop
  git add apps/desktop/package.json
  git commit -m "chore(desktop): bump version to {x.y.z}"
  git tag desktop@{x.y.z}
  git push origin main --tags

  CI 自动完成（与 beta 相同的完整构建流程）：
  ├── build-prerequisites（编译 server + web）
  ├── build-mac-arm64 / build-mac-x64 / build-windows / build-linux
  ├── publish-to-r2（上传安装包到版本目录 + 写版本 manifest）
  │   desktop/{x.y.z}/manifest.json
  │   desktop/{x.y.z}/latest-*.yml
  │   desktop/stable/latest-*.yml    ← stable 渠道的 electron-updater feed
  │   desktop/latest-*.yml           ← 向后兼容旧版客户端（<= v0.2.4-beta.2）
  │   stable/manifest.json           ← 轻量指针更新
  └── create-release（GitHub Release，正式版）
```

#### CI 两种模式

| mode | 触发条件 | 构建 | create-release |
|------|---------|------|----------------|
| `beta` | tag 含 `-beta` | ✅ | ✅（prerelease） |
| `stable` | tag 不含 `-beta` | ✅（完整重新构建） | ✅ |
| `workflow_dispatch` | 手动触发 | ✅ | ✅ |

> Stable 版本会完整重新构建，确保 app 内显示的版本号是正式版（不含 `-beta.N`）。
> `create-release` 对所有触发方式开放，会自动创建 tag（如尚未存在）和 GitHub Release。
> **CI 不再自动 bump 版本号**，所有 app 版本完全由开发者手动管理。

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

手动触发也会创建 GitHub Release（`create-release` 对所有触发方式开放）。version-bump 仅在 tag 触发的 stable 发布后执行。

---

## Quick Reference

| 操作 | 命令 |
|------|------|
| Server 增量发布 | `git tag server-v{version} && git push origin server-v{version}` |
| Web 增量发布 | `git tag web-v{version} && git push origin web-v{version}` |
| Desktop beta 发布 | `git tag desktop@{x.y.z-beta.n} && git push origin desktop@{x.y.z-beta.n}` |
| Desktop stable 发布 | 升版本号 → `git tag desktop@{x.y.z}` → `git push origin main --tags` |
| widget-sdk npm 发布 | `cd packages/widget-sdk && pnpm version patch && pnpm publish --no-git-checks` |
| @openloaf-saas/sdk 更新 | 见下方「@openloaf-saas/sdk 依赖管理」章节 |
| 版本号加一（patch） | `npm version patch --no-git-tag-version` |
| 版本号加一（minor） | `npm version minor --no-git-tag-version` |
| Beta 版本号 | `x.y.z-beta.n`（所有 app 通用） |
| 本地打包 beta 测试 | `pnpm run dist:mac -- --beta=2`（临时改为 x.y.z-beta.2，打包后自动恢复） |

## 用户参数解析

用户通过 `/openloaf-update` 触发发布时，参数**不决定发布范围**，只影响发布模式：

| 用户输入 | 含义 |
|---------|------|
| 无参数 / `beta` | **默认模式**：先分析变更范围，自动判断需要发布 server/web/desktop 中的哪些 |
| `release` / `stable` / `正式版` / `正式` | 发布 Desktop 正式版（从已有 beta promote） |
| `server` / `web` / `desktop` | 明确指定只发布某个 app（仍需分析确认） |
| `全部commit` | 先提交所有未暂存变更，再按默认模式分析 |

> **关键规则：无论用户输入什么参数，第一步永远是分析变更范围，再决定发布哪些 app。** 禁止根据参数直接假设发布目标。

## Common Mistakes

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| 根据用户参数直接假设发布目标 | 用户输入 `beta` 就直接发布 Desktop，跳过变更分析 | **第一步永远是分析变更范围，再决定发布哪些 app** |
| 先提交再类型检查 | 提交了无法编译的代码，CI 必然失败 | **先 `pnpm check-types`，通过后再 commit** |
| 用 `server-v*`/`web-v*` tag 作为 changelog 基准 | Desktop 发布时已包含 server/web，changelog 会重复 | **用所有 app tag 中时间最新的那个**（通常是 `desktop@*`）作为基准 |
| 只看已提交 commit，忽略未暂存变更 | changelog 遗漏大量工作区改动 | 同时检查 `git log` 和 `git diff --stat HEAD` |
| 未 bump 版本号就打 tag | tag 版本与 desktop 已发布的版本重复，增量更新无效 | **先 bump 到新版本号，提交后再打 tag** |
| Desktop 用旧格式 `desktop-v*` 打 tag | CI 不触发 | 必须用 `desktop@{version}` 格式 |
| Stable 发布前未升版本号 | app 内显示 beta 版本号 | 先 `npm version {x.y.z} --no-git-tag-version --prefix apps/desktop`，提交后再打 tag |
| 未打 app 前缀 tag | 下次发布找不到上次发布点 | 始终为每个发布的 app 打前缀 tag |
| 试图在本地手动打包发布 | 绕过 CI，产物不一致 | 通过 git tag 触发 GitHub Actions |
| commit 范围未加路径过滤 | changelog 包含不相关的变更 | 使用 `-- apps/{app}/ packages/` 过滤 |
| SDK 混淆后 dev 编译挂起 | Turbopack 无限卡住 | 见「@openloaf-saas/sdk 依赖管理」排查步骤 |
| Tag 所在 commit 包含 `[skip ci]` | CI 不会被触发 | commit 消息不要包含 `[skip ci]` |
| Lockfile 未更新就推送 tag | CI 构建失败 `ERR_PNPM_OUTDATED_LOCKFILE` | 打包前先运行 `pnpm install --no-frozen-lockfile` 提交后再推送 tag |
| Desktop 打包的 server/web 落后于 stable manifest | Desktop 更新期间增量更新被跳过 | 发布 Desktop 前先确保其打包版本 ≥ stable manifest 中的版本 |
| Beta 用户 `updateChannel` 未设为 `beta` | Electron feed URL 指向 `desktop/stable/`，找不到 beta 更新 | 确保 beta 用户的 `~/.openloaf/.settings.json` 中 `updateChannel: "beta"` |
| Electron feed URL 不含渠道路径 | electron-updater 请求 `desktop/latest-mac.yml`（根目录），R2 上可能不存在 | `resolveElectronFeedUrl()` 必须返回 `${base}/desktop/${channel}` |

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

## Database Migration on Update

Server 增量更新可能包含数据库 schema 变更。迁移系统与增量更新紧密集成：

### 更新流程中的数据库处理

```
增量更新检测到新 server 版本
  → backupDatabase()                    ← 备份 openloaf.db（含 WAL/SHM）
  → 下载并替换 server.mjs
  → 用户重启应用
  → 新 server 启动
    → runPendingMigrations()            ← 自动执行内嵌的未应用迁移
    → initDatabase()
    → startServer()
```

### 崩溃回退包含数据库恢复

```
新 server 启动失败（exit code ≠ 0）
  → recordServerCrash()
    → 删除 updates/server/current/     ← 回退到打包版 server
    → restoreDatabase()                 ← 恢复更新前的 DB 备份
    → 崩溃版本加入黑名单               ← 防止重复更新到同一版本
```

### 发布时的注意事项

- **Schema 变更必须通过 `pnpm run db:migrate` 生成迁移文件**，禁止使用 `db:push`
- 迁移文件（`packages/db/prisma/migrations/`）必须提交到 Git，CI 构建时会内嵌到 server.mjs
- `build-prod.mjs` 使用 `prisma migrate deploy`（而非 `db:push`）生成 seed.db
- seed.db 清理业务数据时**保留 `_prisma_migrations` 表**，新用户需要知道哪些迁移已应用
- 跨版本更新自动处理：migrationRunner 按时间戳顺序执行所有未应用的迁移

> **详细架构和开发指南**请查阅 skill：[database-migration](../database-migration/SKILL.md)

---

## Detailed References

| 文件 | 查阅时机 |
|------|----------|
| [publish-release.md](publish-release.md) | 执行 Release Workflow、修改发布脚本、配置 R2 环境变量、了解 changelog 格式细节、R2 目录结构 |
| [update-system.md](update-system.md) | 修改更新检查/下载/校验/安装逻辑、调试崩溃回滚、修改 IPC 通道、修改 manifest 结构、两步读取协议 |
