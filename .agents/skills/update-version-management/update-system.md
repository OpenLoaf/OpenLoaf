# 更新系统核心逻辑

## URL 解析优先级

`updateConfig.ts` 中的 `resolveUpdateBaseUrl()` 按以下顺序解析：

1. `process.env.OPENLOAF_UPDATE_URL`
2. `runtime.env` 中的 `OPENLOAF_UPDATE_URL`
3. (兼容) `OPENLOAF_UPDATE_MANIFEST_URL` → 从 URL 提取 host
4. (兼容) `OPENLOAF_ELECTRON_UPDATE_URL` → 去掉 `/electron` 后缀
5. 默认值 `https://openloaf-update.hexems.com`

派生 URL：
- 增量清单（server/web）：`${baseUrl}/${channel}/manifest.json`（channel = stable | beta）
- Electron feed：`${baseUrl}/desktop/${channel}`（渠道感知，electron-updater 读取对应渠道目录的 `latest-*.yml`）

## 渠道管理

- 偏好存储在 `~/.openloaf/.settings.json` 的 `updateChannel` 字段
- 默认 `stable`，仅 `stable` 和 `beta` 两个值
- Beta 渠道影响：server/web 增量更新（从 beta manifest 获取）+ Electron 本体更新（electron-updater feed URL 指向 `desktop/beta/` 渠道目录）
- 切换渠道后立即触发一次增量更新检查

### 择优取高策略（Beta Gate，适用于 server/web）

Beta 渠道检查更新时，同时拉取 beta 和 stable 的 manifest，**逐组件独立比较，取较高版本**：

- 双方都无组件 → 跳过更新
- beta 无组件但 stable 有 → 回退使用 stable 组件
- 有 stable 可比 → server 和 web 各自取 `max(beta, stable)`
- 无 stable 可比 → 直接使用 beta

这确保 beta 用户始终能获得最佳可用版本，即使 beta 某个组件落后于 stable。

### 渠道切换行为

- **Beta → Stable**：保持当前已安装版本，未来只从 stable 获取更新。不降级。
- **Stable → Beta**：未来从 beta 获取更新，如有更新版本则升级。

## Remote Manifest 结构

### `stable/manifest.json` / `beta/manifest.json`（渠道指针）

渠道 manifest 是混合格式：desktop 为轻量指针（只含 version），server/web 包含完整信息。

```json
{
  "desktop": { "version": "0.1.1" },
  "server": {
    "version": "1.5.2",
    "url": "https://r2.../server/1.5.2/server.mjs.gz",
    "sha256": "abcdef...",
    "size": 12345678,
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "changelogUrl": "https://raw.githubusercontent.com/.../changelogs/1.5.2"
  },
  "web": {
    "version": "1.5.2",
    "url": "https://r2.../web/1.5.2/web.tar.gz",
    "sha256": "fedcba...",
    "size": 87654321
  },
  "electron": { "minVersion": "40.0.0" }
}
```

> **Desktop 字段说明：** `desktop.version` 只是版本号指针，不含安装包 URL/sha256。客户端需通过两步读取协议获取完整信息（见下文）。

### `desktop/{version}/manifest.json`（版本目录完整信息）

```json
{
  "version": "0.1.1-beta.1",
  "publishedAt": "2026-03-03T10:00:00.000Z",
  "channel": "beta",
  "platforms": {
    "mac-arm64": { "url": "...", "sha256": "...", "size": 12345678 },
    "mac-x64":   { "url": "...", "sha256": "...", "size": 11111111 },
    "win-x64":   { "url": "...", "sha256": "...", "size": 9876543 },
    "linux-x64": { "url": "...", "sha256": "...", "size": 8765432 }
  }
}
```

### `desktop/{stableVersion}/manifest.json`（promote redirect 文件）

```json
{
  "version": "0.1.1",
  "redirectTo": "0.1.1-beta.1",
  "publishedAt": "2026-03-04T12:00:00.000Z"
}
```

## Desktop 版本 Manifest 两步读取协议

`incrementalUpdate.ts` 中导出 `resolveDesktopVersionManifest(baseUrl, version)`：

```typescript
export async function resolveDesktopVersionManifest(
  baseUrl: string,
  version: string
): Promise<unknown> {
  const url = `${baseUrl}/desktop/${version}/manifest.json`
  const manifest = (await fetchJson(url)) as Record<string, unknown>

  // promote 创建的 redirect 文件含 redirectTo 字段
  if (typeof manifest.redirectTo === 'string') {
    return fetchJson(`${baseUrl}/desktop/${manifest.redirectTo}/manifest.json`)
  }

  return manifest
}
```

**调用时序：**
```
1. 读 stable/manifest.json → { desktop: { version: "0.1.1" }, ... }
2. resolveDesktopVersionManifest(baseUrl, "0.1.1")
   → 读 desktop/0.1.1/manifest.json
   → 发现 redirectTo: "0.1.1-beta.1"
   → 读 desktop/0.1.1-beta.1/manifest.json
   → 返回完整 platforms 信息（sha256、url、size）
```

## Local Manifest

路径：`~/.openloaf/updates/local-manifest.json`

```json
{
  "server": { "version": "1.5.2", "appliedAt": "2026-03-01T..." },
  "web": { "version": "1.5.2", "appliedAt": "2026-03-01T..." },
  "crashedServerVersions": ["1.5.1-beta.2"]
}
```

## Desktop 更新优先（增量更新抑制）

Desktop（Electron）本体打包时已包含最新的 server 和 web，因此当 Desktop 有新版本可用时，增量更新是多余的：

- `checkForIncrementalUpdates()` 开头检查 `getAutoUpdateStatus()`
- 若 Desktop 更新状态为 `available`、`downloading` 或 `downloaded`，直接跳过增量更新
- 返回 `{ ok: false, reason: 'desktop-update-pending' }`，不 emit 状态变更
- 定期检查和手动检查均受此规则约束

**时序**：autoUpdate 启动后 8 秒首检，incrementalUpdate 启动后 10 秒首检。若 Desktop 在 2 秒窗口内检测到新版本，增量更新即被跳过。若 autoUpdate 尚在 `checking`（网络慢），增量更新正常执行（此时无法确定是否有 Desktop 更新）。

**发布协调**：发布 Desktop 新版本时，确保其打包的 server/web 版本不低于当前 stable manifest 中的版本。否则 Desktop 更新后 `pruneOutdatedUpdates()` 不会清理已有增量更新（更高版本保留），但用户在 Desktop 更新安装前的时段内不会收到本该有的增量更新。

## 增量更新流程（server/web）

1. `checkForIncrementalUpdates()` 开头检查 Desktop 更新状态，若有则跳过
2. 从 `resolveManifestUrl()` 获取渠道 manifest（`stable/manifest.json` 或 `beta/manifest.json`）
3. 从 manifest 的 `server`/`web` 字段获取完整下载信息（URL、sha256、size）
4. 对比本地版本（local-manifest 或 bundled package.json），版本不同则下载
5. 下载 → SHA-256 校验 → 解压到 `pending/`
6. 原子替换 `pending/` → `current/`（旧 current 先备份再删除）
7. 更新 local-manifest.json
8. 广播 `openloaf:incremental-update:status` 到所有窗口
9. 用户在 AutoUpdateGate 中点击"立即重启"

## 崩溃回滚

`recordServerCrash()` 追踪 server 子进程崩溃：
- 单次崩溃立即回滚：删除 `~/.openloaf/updates/server/current/`
- 将崩溃版本加入黑名单（`crashedServerVersions`），防止再次自动升级到同一版本
- 清除 local-manifest 中的 server 条目
- 下次启动回退到 `process.resourcesPath/server.mjs`

## 文件路径解析（incrementalUpdatePaths.ts）

`resolveServerPath()` 和 `resolveWebRoot()` 带有**版本比较保护**：

1. 检查增量更新目录是否存在
2. 比较 `local-manifest.json` 中的缓存版本与 `server.package.json`/`web.package.json` 中的打包版本
3. 如果打包版本更新 → 回退到打包版本（即使缓存文件仍存在）
4. 否则使用增量更新版本

```
resolveServerPath():
  ~/.openloaf/updates/server/current/server.mjs
    → 版本比较（shouldUseBundled）
    → 打包版本更新时回退到 process.resourcesPath/server.mjs

resolveWebRoot():
  ~/.openloaf/updates/web/current/out/
    → 版本比较（shouldUseBundled）
    → 打包版本更新时回退到 process.resourcesPath/out/
```

这与 `pruneOutdatedUpdates()` 形成双重保护：即使旧缓存文件因 EPERM 无法删除，路径解析也会根据版本号回退到打包版本。

## IPC 通道

| Channel | 方向 | 用途 |
|---------|------|------|
| `openloaf:incremental-update:check` | renderer → main | 触发检查 |
| `openloaf:incremental-update:get-status` | renderer → main | 获取状态快照 |
| `openloaf:incremental-update:reset` | renderer → main | 重置到打包版本 |
| `openloaf:incremental-update:status` | main → renderer | 状态变更广播 |
| `openloaf:app:get-update-channel` | renderer → main | 获取渠道 |
| `openloaf:app:switch-update-channel` | renderer → main | 切换渠道 |
| `openloaf:auto-update:check` | renderer → main | 手动触发 Desktop 本体更新检查 |
| `openloaf:auto-update:status` | main → renderer | Desktop 本体更新状态广播 |
| `openloaf:app:relaunch` | renderer → main | 重启应用 |

## 主进程错误处理策略

`index.ts` 注册了进程级错误处理器：

- `uncaughtException` → **致命**：调用 `handleProcessTermination()` 关闭应用（不可恢复）
- `unhandledRejection` → **非致命**：仅记录日志，**不终止进程**
  - electron-updater 自动下载失败（如 CDN 404、网络超时）会产生未捕获的 Promise 拒绝
  - 更新下载失败不应影响应用正常使用
  - 若改为致命处理会导致：更新服务器异常时用户无法启动应用

> **规则：** 新增异步操作时，确保 Promise 链有 `.catch()` 或在 `async` 函数中有 `try/catch`。但即使遗漏，`unhandledRejection` 也只记录日志不会崩溃。

## Electron 本体更新

`autoUpdate.ts` 使用 `electron-updater` 的 generic provider：
- feed URL 由 `resolveElectronFeedUrl()` 返回：`${baseUrl}/desktop/${channel}`
  - stable 用户：electron-updater 读 `${baseUrl}/desktop/stable/latest-mac.yml`
  - beta 用户：electron-updater 读 `${baseUrl}/desktop/beta/latest-mac.yml`
  - 渠道由 `resolveUpdateChannel()` 决定（`~/.openloaf/.settings.json` 的 `updateChannel` 字段，默认 `stable`）
  - promote 时 CI 会把 yml 从 beta 版本目录复制到 `desktop/stable/`，保证 stable 用户能检测到更新
  - R2 根目录 `desktop/latest-*.yml` 仅用于向后兼容旧版客户端（<= v0.2.4-beta.2）
- 启动后 8 秒首次检查，之后每 6 小时检查一次
- `autoDownload: true`，下载完成后等待用户确认安装
- `autoInstallOnAppQuit: false`（禁止退出时自动启动安装程序）
  - Windows 上 `autoInstallOnAppQuit: true` 会在关闭时静默启动 NSIS installer，用户可能立即重新打开应用导致安装程序与主程序同时运行、安装失败
  - 更新安装统一由用户在 UI 点击"立即安装"触发（走 `quitAndInstall` 路径，先退出再安装，不冲突）
- 通过 `openloaf:auto-update:status` 广播状态

## AutoUpdateGate UI

- 监听 `openloaf:incremental-update:status` 事件
- state === 'ready' 时弹出对话框
- `changelogUrl` 指向 GitHub raw URL（如 `https://raw.githubusercontent.com/OpenLoaf/OpenLoaf/main/apps/server/changelogs/0.1.0`）
- 客户端通过 `navigator.language` 检测语言，拼接 `/{lang}.md` 拉取
- 回退策略：先尝试用户语言（如 `/en.md`），失败则回退 `/zh.md`
- 去掉 YAML frontmatter 后展示
- 防重复弹窗（通过 `ts` 时间戳去重）

## AboutOpenLoaf UI

- 展示桌面端/服务端/Web 三个版本号
- 更新状态文本（正在检查/下载中/已就绪/失败）
- "检测更新"按钮（手动触发）
- Beta 体验 Switch 开关（仅 Electron 环境可见）
