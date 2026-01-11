# Electron 自动更新流程（Tenas）

本文描述当前项目的**自动更新业务逻辑与代码逻辑**，适用于 Electron 打包版本。  
说明：dev 模式不会触发自动更新（`app.isPackaged === false` 会跳过）。

## 业务逻辑（用户视角）

1) 应用启动后自动检测更新  
- 启动约 8 秒后自动检查一次  
- 之后每 6 小时自动检查一次  

2) 设置页可手动触发“检测更新”  
- 用户点击“检测更新”按钮，立即执行一次检查  

3) 发现新版本后自动后台下载  
- 下载进度在设置页展示  
- 下载完成后，弹出全局提示弹窗  

4) 下载完成后的选择  
- “立即重启”：应用退出并安装新版本  
- “稍后”：保持当前版本继续使用，更新包留在本地  

5) server/web 的更新方式  
- server 与 web 资源被打包在 Electron 的 `Resources` 内  
- 自动更新替换整个 `.app`，因此 server/web 也随 App 一起更新  

## 代码逻辑（模块与链路）

### 状态结构

更新状态由主进程统一维护并广播给渲染进程：

`AutoUpdateStatus` 主要字段：
- `state`：`idle | checking | available | not-available | downloading | downloaded | error`
- `currentVersion`：当前版本号（`app.getVersion()`）
- `nextVersion`：检测到的新版本号（若有）
- `progress`：下载进度（百分比/速度/字节数）
- `error`：错误信息（若有）
- `ts`：状态产生时间戳

### 主进程（Electron Main）

入口：`apps/electron/src/main/autoUpdate.ts`

职责：
- 设置 `electron-updater` 事件监听  
- 维护全局状态快照  
- 向所有窗口广播 `tenas:auto-update:status`  
- 提供手动检查与安装更新的函数  

关键点：
- 仅 `app.isPackaged` 才启用  
- 启动后 8 秒触发一次检查  
- 每 6 小时定时检查  

### IPC 通道（Main ↔ Renderer）

注册位置：`apps/electron/src/main/ipc/index.ts`

通道：
- `tenas:app:version`：返回当前版本号  
- `tenas:auto-update:check`：手动检查更新  
- `tenas:auto-update:status`：返回当前状态快照  
- `tenas:auto-update:install`：安装已下载更新并重启  

### 预加载桥接（Preload）

位置：`apps/electron/src/preload/index.ts`

对 `window.tenasElectron` 暴露方法：
- `getAppVersion()`  
- `checkForUpdates()`  
- `getAutoUpdateStatus()`  
- `installUpdate()`  

事件转发：
- `tenas:auto-update:status` → `window` 事件 `tenas:auto-update:status`

### Web 侧展示与交互

1) 设置页：`apps/web/src/components/setting/menus/AboutTenas.tsx`  
- 展示版本号与更新状态文案  
- “检测更新”按钮触发 `checkForUpdates()`  
- 若状态是 `downloaded`，按钮变为“立即重启”  

2) 全局弹窗：`apps/web/src/components/layout/AutoUpdateGate.tsx`  
- 监听 `tenas:auto-update:status`  
- 当状态进入 `downloaded` 时弹出提示  
- “立即重启”调用 `installUpdate()`  

挂载位置：`apps/web/src/components/Providers.tsx`

## 状态流转示意

1) 启动后自动检查：`idle → checking`  
2) 无更新：`checking → not-available`  
3) 有更新：`checking → available → downloading`  
4) 下载完成：`downloading → downloaded`  
5) 用户确认重启：调用 `installUpdate()` → 应用重启  

## 相关文件清单

- `apps/electron/src/main/autoUpdate.ts`
- `apps/electron/src/main/ipc/index.ts`
- `apps/electron/src/preload/index.ts`
- `apps/web/src/components/setting/menus/AboutTenas.tsx`
- `apps/web/src/components/layout/AutoUpdateGate.tsx`
- `apps/web/src/components/Providers.tsx`
- `apps/web/src/types/electron.d.ts`
