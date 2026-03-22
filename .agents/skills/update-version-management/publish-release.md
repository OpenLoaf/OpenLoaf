
## 版本号约定

- 三个独立版本号：`apps/server/package.json`、`apps/web/package.json`、`apps/desktop/package.json`
- 语义化版本 + prerelease 标签：`1.0.0`（stable）、`1.0.1-beta.1`（beta）
- 版本号含 `-beta` 自动归入 beta 渠道

### Electron 桌面端发布（Beta-only 构建）

> ⚠️ 旧格式 `desktop-v*` 已废弃，必须用 `desktop@*`。
> ⚠️ 禁止直接打 stable tag 触发构建。Stable 只能从已有 beta promote。

CI 自动完成：多平台构建（macOS ARM64 + Windows + Linux）→ R2 上传 → GitHub Release → 版本号 +1。

**Desktop 与增量更新的协调**：Desktop 打包时已包含最新的 server 和 web。客户端检测到 Desktop 新版本后会自动跳过 server/web 增量更新（节省带宽）。因此发布 Desktop 时，确保其打包的 server/web 版本 ≥ 当前 stable manifest 中的版本，避免 Desktop 更新期间用户无法获取增量修复。

详见 SKILL.md 中「Electron 桌面端发布」章节。

## 发布流程（Server/Web via CI）

Server/Web 的构建和发布完全由 GitHub Actions 完成（`.github/workflows/publish-server.yml`、`.github/workflows/publish-web.yml`）。CI 流程：

1. 从 tag 名提取版本号
2. 安装依赖、生成 Prisma 客户端
3. 构建 → gzip 压缩（level 9）→ SHA-256 计算
4. 上传构件到 R2：`server/${version}/server.mjs.gz`（共享池，不分渠道）
5. 更新 `${channel}/manifest.json`（包含 `changelogUrl`，指向 GitHub raw）
6. 版本号 patch +1 并提交推送

## 发布流程（Desktop via CI）

Desktop 的构建和发布完全由 GitHub Actions 完成（`.github/workflows/publish-desktop.yml`）。

### Desktop 发布前置检查（本地，必须）

在打 `desktop@*` tag 之前，必须先准备 changelog 文件：

1. 创建 `apps/desktop/changelogs/{version}/en.md`
2. 建议同步创建 `apps/desktop/changelogs/{version}/zh.md`
3. 确认 changelog 文件和版本 bump 一起进入发布 commit

> ⚠️ GitHub Release 正文**不是**从 annotated tag 读取，而是由 CI `create-release` job 读取 `apps/desktop/changelogs/{version}/en.md`。如果该文件不存在，workflow 会回退成 `Release v{version}`。

**Beta 构建流程**（打 `desktop@x.y.z-beta.n` tag 触发）：

1. 检测 tag 含 `-beta` → mode=beta
2. 将 tag 中的版本号直接写回 `apps/desktop/package.json` 的 `version` 字段
3. 编译 server + web（build-prerequisites）
4. 多平台构建（macOS ARM64 + Windows + Linux）
5. 上传安装包 → `desktop/{version}/{file}`（版本目录）
6. 上传 yml → `desktop/{version}/{yml}` + `desktop/beta/{yml}`
7. 写 `desktop/{version}/manifest.json`（完整版本信息）
8. 更新 `beta/manifest.json` → `desktop.version`（轻量指针）
9. 读取 `apps/desktop/changelogs/{version}/en.md` 生成 GitHub Release 正文；缺失时回退成 `Release v{version}`
10. 创建 GitHub Release（prerelease=true）

**Stable promote 流程**（打 `desktop@x.y.z` tag 触发）：

1. 检测 tag 不含 `-beta` → 检查 R2 中是否有对应 beta 版本
2. 若有 beta → mode=promote，跳过所有构建
3. 执行 `scripts/promote-desktop.mjs`（详见下方 Promote 脚本）
4. 读取 `apps/desktop/changelogs/{version}/en.md` 生成 GitHub Release 正文；缺失时回退成 `Release v{version}`
5. 创建 GitHub Release（正式版）
6. 版本号 +1 并提交推送

## desktop 版本目录 manifest 格式

`desktop/{version}/manifest.json` — **完整版本信息**（beta 发布时写入，永久不变）：

`desktop/{stableVersion}/manifest.json` — **promote 创建的 redirect 文件**（stable promote 时写入）：

## 客户端两步读取协议（Desktop 版本检查）

stable/beta manifest 的 `desktop.version` 只存版本号，不含安装包详情。客户端需两步读取：

实现：`resolveDesktopVersionManifest(baseUrl, version)` in `incrementalUpdate.ts`。

## Promote 脚本（`scripts/promote-desktop.mjs`）

将 beta 版本 promote 到 stable 渠道（由 CI `promote-to-stable` job 调用，也可手动运行）：

### 工作原理

1. 验证 `desktop/{betaVersion}/manifest.json` 存在于 R2
2. 写 `desktop/{stableVersion}/manifest.json`（redirect 文件，含 `redirectTo: betaVersion`）
3. 复制 beta 版本目录的 `latest-*.yml` 到 `desktop/stable/`（渠道目录）
4. 同时复制到 `desktop/`（根目录，向后兼容）
5. 更新 `stable/manifest.json` → `desktop.version = stableVersion`（保留 server/web 字段）

## Server/Web 增量更新 Promote（旧机制）

Server/Web 的 beta → stable promote 使用 `pnpm promote`（或 `scripts/promote.mjs`），工作原理不同于 Desktop：

- Server/Web 的 stable 和 beta manifest 包含完整的 sha256/url 信息（不是轻量指针）
- Promote = 将 beta manifest 中的 server/web 条目复制到 stable manifest
- 版本号保留原样（如 `1.5.3-beta.1`），构件 URL 不变（共享池复用）

## Changelog 文件格式

放在各 app 的 `changelogs/` 目录下：

- 目录结构：`changelogs/{version}/{lang}.md`（如 `changelogs/0.1.0/zh.md`、`changelogs/0.1.0/en.md`）
- **Desktop**：`en.md` 为必填，因为 GitHub Release 正文与 `desktop/{version}/CHANGELOG.md` 都优先读取它；建议同时提供 `zh.md`
- **Server/Web**：`zh.md` 为默认语言，`en.md` 等其他语言可选
- Desktop changelog 还会被 CI 复制到 R2 版本目录 `desktop/{version}/CHANGELOG.md`（`en.md` 优先，无则取第一个语言）
- Server/Web 的 changelog 直接从 GitHub raw content 读取（公开仓库），无需上传到 R2
- manifest 中 `changelogUrl` 指向 GitHub raw URL（不含语言后缀，客户端拼接 `/{lang}.md`）

## 共享工具模块

`scripts/shared/publishUtils.mjs` 导出：

| 函数 | 用途 |
|------|------|
| `loadEnvFile(path)` | 加载 .env 文件 |
| `validateR2Config()` | 校验 R2_* 环境变量并返回配置 |
| `validateCosConfig()` | 校验 COS_* 环境变量，可选，返回 null 表示未配置 |
| `createS3Client(config)` | 创建 S3/R2 客户端 |
| `createCosS3Client(config)` | 创建腾讯 COS S3 兼容客户端（forcePathStyle=true） |
| `uploadFile(s3, bucket, key, path)` | 上传文件 |
| `downloadJson(s3, bucket, key)` | 下载 JSON |
| `uploadJson(s3, bucket, key, data)` | 上传 JSON（ContentType: application/json） |
| `computeSha256(path)` | 计算文件 SHA-256 哈希（Promise） |
| `detectChannel(version)` | 版本号推断渠道（含 -beta → beta，否则 → stable） |
| `resolveChannel(args, version)` | CLI 参数 > 自动推断 |
| `uploadChangelogs(opts)` | 上传 changelogs 并更新 index.json，支持 `versionDirPrefix` 额外写 CHANGELOG.md |
| `buildChangelogUrl(url, component, version)` | 生成 GitHub raw changelog URL |
| `cleanupOldVersions(opts)` | 清理旧版本目录（保留最近 N 个） |

## 环境变量

发布脚本需要以下变量（来自 `.env.prod` 或 CI secrets）：

| 变量 | 说明 | 必填 |
|------|------|------|
| `R2_BUCKET` | R2 bucket 名称 | ✅ |
| `R2_PUBLIC_URL` | R2 公共访问 URL（无末尾斜杠） | ✅ |
| `R2_ENDPOINT` | R2 S3 兼容 endpoint | ✅ |
| `R2_ACCESS_KEY_ID` | R2 访问密钥 ID | ✅ |
| `R2_SECRET_ACCESS_KEY` | R2 访问密钥 Secret | ✅ |
| `COS_BUCKET` | 腾讯 COS bucket 名称 | ❌（可选同步） |
| `COS_PUBLIC_URL` | COS 公共访问 URL | ❌ |
| `COS_ENDPOINT` | COS S3 endpoint（不含 bucket） | ❌ |
| `COS_REGION` | COS region | ❌ |
| `COS_SECRET_ID` | COS SecretId | ❌ |
| `COS_SECRET_KEY` | COS SecretKey | ❌ |

CI 中通过 GitHub Secrets 注入，本地开发通过各 app 的 `.env.prod` 加载。

## 注意事项

- Web tar.gz 打包使用 `-C out/ .`，避免解压后双层嵌套
- Server gzip 用 level 9 最大压缩
- 增量更新只检查版本是否不同，不做大小比较，beta→stable 不会自动回退
- electron-builder `signIgnore` 使用 **regex**（`\\.js$`），不是 glob
- `extraMetadata.main` 必须匹配架构（由 `scripts/dist.mjs` 动态处理）
- `dist.mjs` 自动添加 `--publish=never`，阻止 electron-builder 因检测到 git tag 而自动发布
- `dist.mjs` 支持 `--beta[=N]` 参数：临时将版本号改为 `x.y.z-beta.N` 打包，打包后自动恢复 `package.json`。用于本地测试自动更新流程（例：`pnpm run dist:mac -- --beta=2`）
- Desktop CI 里不要用 `npm version` 从 tag 回写版本号；仓库包含 `catalog:` 依赖时会在 runner 上报 `EUNSUPPORTEDPROTOCOL`
- 所有 Desktop 构建只走 beta 渠道，stable 只能从 beta promote
- Desktop CI 中 Web 构建需要 `NEXT_PUBLIC_*` 环境变量（构建时内联，非运行时）
- Linux 仅构建 AppImage（`package.json` 中 `build.linux.target: ["AppImage"]`）
- GitHub Release 中只上传安装包（DMG/exe/AppImage），不上传 `.zip`（自动更新用）和 `.blockmap`
- Desktop 版本目录内容**永远不变**（immutable），promote 不修改 beta 版本目录
- `cleanupOldVersions` 保留最近 3 个版本目录；redirect 文件（stable 版本目录）体积极小，不计入清理
