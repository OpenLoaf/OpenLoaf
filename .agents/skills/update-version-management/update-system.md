# 更新系统核心逻辑

## URL 解析优先级

`updateConfig.ts` 中的 `resolveUpdateBaseUrl()` 按以下顺序解析：

1. `process.env.OPENLOAF_UPDATE_URL`
2. `runtime.env` 中的 `OPENLOAF_UPDATE_URL`
3. (兼容) `OPENLOAF_UPDATE_MANIFEST_URL` → 从 URL 提取 host
4. (兼容) `OPENLOAF_ELECTRON_UPDATE_URL` → 去掉 `/electron` 后缀
5. 默认值 `https://openloaf-update.hexems.com`

派生 URL：
- 增量清单：`${baseUrl}/${channel}/manifest.json` (channel = stable | beta)
- Electron feed：`${baseUrl}/electron` (固定 stable)

## 渠道管理

- 偏好存储在 `~/.openloaf/.settings.json` 的 `updateChannel` 字段
- 默认 `stable`，仅 `stable` 和 `beta` 两个值
- Beta 渠道仅影响增量更新（server + web），Electron 本体始终 stable
- 切换渠道后立即触发一次增量更新检查

## Remote Manifest 结构

```json
{
  "schemaVersion": 1,
  "server": {
    "version": "1.0.0",
    "url": "https://r2.../server/1.0.0/server.mjs.gz",
    "sha256": "abcdef...",
    "size": 12345678,
    "updatedAt": "2026-02-07T00:00:00.000Z",
    "changelogUrl": "https://r2.../changelogs/server/1.0.0.md"
  },
  "web": { ... },
  "electron": { "minVersion": "40.0.0" }
}
```

## Local Manifest

路径：`~/.openloaf/updates/local-manifest.json`

```json
{
  "server": { "version": "1.0.0", "appliedAt": "2026-02-07T..." },
  "web": { "version": "0.1.0", "appliedAt": "2026-02-07T..." }
}
```

## 增量更新流程

1. `checkForIncrementalUpdates()` 从 `resolveManifestUrl()` 获取清单
2. 对比本地版本（local-manifest 或 bundled package.json）
3. 版本不同则下载（不做大小比较，beta→stable 不回退）
4. 下载 → SHA-256 校验 → 解压到 `pending/`
5. 原子替换 `pending/` → `current/`（旧 current 先备份再删除）
6. 更新 local-manifest.json
7. 广播 `openloaf:incremental-update:status` 到所有窗口
8. 用户在 AutoUpdateGate 中点击"立即重启"

## 崩溃回滚

`recordServerCrash()` 追踪 server 子进程崩溃：
- 30 秒内连续 3 次崩溃 → 自动删除 `~/.openloaf/updates/server/current/`
- 清除 local-manifest 中的 server 条目
- 下次启动回退到 `process.resourcesPath/server.mjs`

## 文件路径解析（incrementalUpdatePaths.ts）

```
resolveServerPath():
  ~/.openloaf/updates/server/current/server.mjs  →  process.resourcesPath/server.mjs

resolveWebRoot():
  ~/.openloaf/updates/web/current/out/  →  process.resourcesPath/out/
```

## IPC 通道

| Channel | 方向 | 用途 |
|---------|------|------|
| `openloaf:incremental-update:check` | renderer → main | 触发检查 |
| `openloaf:incremental-update:get-status` | renderer → main | 获取状态快照 |
| `openloaf:incremental-update:reset` | renderer → main | 重置到打包版本 |
| `openloaf:incremental-update:status` | main → renderer | 状态变更广播 |
| `openloaf:app:get-update-channel` | renderer → main | 获取渠道 |
| `openloaf:app:switch-update-channel` | renderer → main | 切换渠道 |
| `openloaf:app:relaunch` | renderer → main | 重启应用 |

## Electron 本体更新

`autoUpdate.ts` 使用 `electron-updater` 的 generic provider：
- feed URL 通过 `resolveElectronFeedUrl()` 获取
- 启动后 8 秒首次检查，之后每 6 小时检查一次
- `autoDownload: true`，下载完成后等待用户确认安装
- `autoInstallOnAppQuit: true`
- 通过 `openloaf:auto-update:status` 广播状态

## AutoUpdateGate UI

- 监听 `openloaf:incremental-update:status` 事件
- state === 'ready' 时弹出对话框
- `changelogUrl` 是不含语言后缀的 base URL（如 `https://r2.../changelogs/server/0.1.0`）
- 客户端通过 `navigator.language` 检测语言，拼接 `.{lang}.md` 拉取
- 回退策略：先尝试用户语言（如 `.en.md`），失败则回退 `.zh.md`
- 去掉 YAML frontmatter 后展示
- 防重复弹窗（通过 `ts` 时间戳去重）

## AboutOpenLoaf UI

- 展示桌面端/服务端/Web 三个版本号
- 更新状态文本（正在检查/下载中/已就绪/失败）
- "检测更新"按钮（手动触发）
- Beta 体验 Switch 开关（仅 Electron 环境可见）
