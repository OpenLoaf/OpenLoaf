---
name: update-version-management
description: >
  Use when developing, extending, or debugging the update system, version
  management, or release pipeline — Electron auto-update, server/web
  incremental updates, update channels, changelog files, publish scripts,
  or version bumps across apps
---

# Update & Version Management

## Overview

Tenas 采用双层更新机制：
1. **Electron 本体更新** — `electron-updater` generic provider，从 R2 拉取 dmg/exe/AppImage
2. **增量更新** — server.mjs + web out/ 独立版本管理，gzip/tar.gz 下载 → SHA-256 校验 → 原子替换

两层更新共享同一个 R2 基础 URL (`TENAS_UPDATE_URL`)，但 Electron 本体始终走 stable，增量更新支持 stable/beta 渠道切换。

## When to Use

- 修改更新检查、下载、校验、安装逻辑
- 添加/修改更新渠道（stable/beta）
- 修改 manifest.json 结构或版本比较逻辑
- 添加新组件到增量更新系统
- 修改发布脚本（publish-update.mjs）
- 版本号升级（patch/minor/major/beta）
- 编写 changelog
- 修改 AutoUpdateGate 或 AboutTenas 中的更新 UI
- 调试崩溃回滚机制
- 修改 electron-builder 打包配置

## Architecture

```
┌────────────────────────────────────────────────┐
│  R2 Storage (r2-tenas-update.hexems.com)       │
│  ├── stable/manifest.json                      │
│  ├── beta/manifest.json                        │
│  ├── electron/latest-mac.yml, *.dmg, *.zip     │
│  ├── server/{version}/server.mjs.gz            │
│  ├── web/{version}/out.tar.gz                  │
│  └── changelogs/{component}/{version}.md       │
└────────────────────────────────────────────────┘
         ↑ publish scripts         ↓ electron-updater / incrementalUpdate
┌──────────────────┐    ┌──────────────────────────────────┐
│  发布脚本         │    │  Electron Main Process           │
│  server/publish   │    │  ├── updateConfig.ts   (URL/渠道) │
│  web/publish      │    │  ├── autoUpdate.ts     (本体)    │
│  shared/utils     │    │  ├── incrementalUpdate.ts (增量) │
└──────────────────┘    │  └── ipc/index.ts      (IPC)    │
                        └──────────────────────────────────┘
                                     ↓ IPC
                        ┌──────────────────────────────────┐
                        │  Renderer (Web)                   │
                        │  ├── AutoUpdateGate.tsx (弹窗)    │
                        │  └── AboutTenas.tsx    (设置页)   │
                        └──────────────────────────────────┘
```

## Key Files

### Electron 主进程

| 文件 | 职责 |
|------|------|
| `apps/electron/src/main/updateConfig.ts` | URL 解析、渠道读写、`.settings.json` 持久化 |
| `apps/electron/src/main/autoUpdate.ts` | electron-updater 封装，本体更新检查/下载/安装 |
| `apps/electron/src/main/incrementalUpdate.ts` | 增量更新核心：manifest 获取、下载、SHA-256 校验、解压、原子替换、崩溃回滚 |
| `apps/electron/src/main/incrementalUpdatePaths.ts` | 路径解析：`~/.tenas/updates/` → `process.resourcesPath` 回退 |
| `apps/electron/src/main/ipc/index.ts` | 更新相关 IPC handlers 注册 |
| `apps/electron/src/preload/index.ts` | 暴露 `checkIncrementalUpdate` / `getUpdateChannel` / `switchUpdateChannel` 等 API |

### 前端 UI

| 文件 | 职责 |
|------|------|
| `apps/web/src/components/layout/AutoUpdateGate.tsx` | 更新就绪弹窗 + changelog 展示 |
| `apps/web/src/components/setting/menus/AboutTenas.tsx` | 版本信息 + Beta 开关 + 手动检查更新 |
| `apps/web/src/types/electron.d.ts` | `TenasIncrementalUpdateStatus` 等类型定义 |

### 发布脚本

| 文件 | 职责 |
|------|------|
| `scripts/shared/publishUtils.mjs` | 共享工具：env 加载、S3 客户端、SHA-256、changelog 上传、渠道检测 |
| `apps/server/scripts/publish-update.mjs` | Server 增量更新发布：构建 → gzip → 上传 → 更新 manifest |
| `apps/web/scripts/publish-update.mjs` | Web 增量更新发布：构建 → tar.gz → 上传 → 更新 manifest |

### 配置与 Changelog

| 文件 | 职责 |
|------|------|
| `apps/electron/resources/runtime.env` | 生产环境 `TENAS_UPDATE_URL` |
| `apps/electron/package.json` | `build.publish` 配置 electron-updater 源 |
| `apps/{server,web,electron}/changelogs/*.md` | YAML frontmatter + markdown 更新日志 |

## Critical Patterns

详见各专题文档：

- [update-system.md](update-system.md) — 更新系统核心逻辑与数据流
- [publish-release.md](publish-release.md) — 发布流程与版本管理
