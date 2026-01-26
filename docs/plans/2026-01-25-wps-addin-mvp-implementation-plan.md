# WPS Add-in MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Tenas 内双击 Office 文件时自动启动 WPS 并加载 Tenas AI 加载项，TaskPane 展示文件名与后端健康状态。

**Architecture:** Electron 主进程启动 127.0.0.1:28888 静态服务承载 apps/wps TaskPane；渲染进程调用 WpsInvoke/WpsAddonMgr 安装并启动加载项；TaskPane 通过 tRPC health 校验后端，显示当前文件名。

**Tech Stack:** Electron, Next.js (apps/web), tRPC (apps/server), WPS Add-in (wpsjs), Node.js static server

> 说明：根据用户要求，本次实现暂不执行 TDD 自动化测试，仅进行手动验证。若后续需要补充测试框架，再将对应步骤替换为 TDD。

---

### Task 1: 扩展基础配置以支持“文档打开方式”

**Files:**
- Modify: `packages/api/src/types/basic.ts`
- Modify: `apps/server/src/modules/settings/tenasConfStore.ts`
- Modify: `apps/server/src/modules/settings/settingsService.ts`
- Modify: `apps/web/src/hooks/use-basic-config.ts`
- Modify: `apps/web/src/components/setting/menus/BasicSettings.tsx`

**Step 1: 手动验证当前设置页**
- 操作：打开设置页，确认当前不存在“文档打开方式”项
- 预期：设置页无该项

**Step 2: 增加配置字段**
- 添加 `appOfficeOpenMode: "wps" | "office"` 到 `BasicConfig` schema
- 默认值设为 `"wps"`
- `settingsService` 内完成字段归一化与持久化
- `useBasicConfig` 默认值同步

**Step 3: 设置页新增选择项**
- 在 `BasicSettings.tsx` 的“系统配置”分组中添加“文档打开方式”
- 选项：WPS（默认）/ Microsoft Office（暂不实现）
- 未安装时置灰（后续 Task 2 接入检测）

**Step 4: 手动验证更新结果**
- 操作：刷新设置页，切换选项
- 预期：默认 WPS，Office 选项可见且后续可控制禁用状态

---

### Task 2: 检测 WPS / Office 安装状态并暴露给 Web

**Files:**
- Create: `apps/electron/src/main/services/detectOfficeInstallations.ts`
- Modify: `apps/electron/src/main/ipc/index.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/web/src/types/electron.d.ts`

**Step 1: 手动验证当前无检测接口**
- 操作：在渲染进程调用 `window.tenasElectron?.getOfficeInstallations`（预期不存在）

**Step 2: 实现检测逻辑**
- 根据 `process.platform` 检测常见安装路径：
  - Windows: `C:\\Program Files\\Kingsoft\\WPS Office` / `C:\\Program Files (x86)\\Kingsoft\\WPS Office`
  - macOS: `/Applications/WPS Office.app` / `/Applications/Microsoft Word.app`
  - Linux: `/usr/bin/wps` / `/usr/bin/et` / `/usr/bin/wpp`
- 返回 `{ wps: boolean, office: boolean }`

**Step 3: 添加 IPC + preload 暴露**
- IPC handler: `tenas:office:detect`
- preload 暴露：`getOfficeInstallations()`
- web 类型声明补齐

**Step 4: 手动验证结果**
- 操作：在 web 调用检测接口，打印结果
- 预期：返回布尔值结构

---

### Task 3: 扩展文件类型集合与 Office 打开逻辑

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemEntryVisual.tsx`
- Modify: `apps/web/src/components/file/lib/file-viewer-target.ts`
- Modify: `apps/web/src/components/file/lib/open-file.ts`
- Create: `apps/web/src/lib/open-wps.ts`

**Step 1: 扩展扩展名集合**
- 将文档/表格/演示扩展补齐到集合
- 维持图标分类与预览逻辑不冲突

**Step 2: 新增 WPS 打开辅助模块**
- 提供：
  - `resolveOfficeClientType(ext)`
  - `ensureWpsAddonInstalled(addonType)`
  - `invokeWpsOpenFile(filePath, serverUrl)`
- 内部调用 `WpsAddonMgr`/`WpsInvoke`
- 失败时 toast 提示

**Step 3: open-file 路由**
- 若 `appOfficeOpenMode === "wps"` 且文件为 Office 扩展，则走 WPS 打开
- 仅 stack 模式触发，modal/embed 仍走内置预览

**Step 4: 手动验证**
- 操作：双击 Office 文件
- 预期：调用 WPS 打开流程（尚未完成加载项时先确保调用链生效）

---

### Task 4: 创建 `apps/wps` 并实现加载项入口

**Files:**
- Create: `apps/wps/*` (via `wpsjs create`)
- Create: `apps/wps/src/main.js`
- Create: `apps/wps/src/taskpane/App.tsx`
- Create: `apps/wps/src/taskpane/wps-bridge.ts`
- Create: `apps/wps/src/taskpane/trpc.ts`
- Add: `apps/wps/assets/tenas-ai.png`

**Step 1: 使用 wpsjs 脚手架**
- 命令：`wpsjs create` 生成目录并调整到 monorepo
- 保留 publish 产物结构

**Step 2: 加载项入口函数**
- 实现 `openFileFromTenas`：按扩展名打开文档/表格/演示
- 创建 TaskPane：`Application.CreateTaskPane("http://127.0.0.1:28888/taskpane")`

**Step 3: TaskPane UI**
- 展示：标题 + 当前文件名 + health 状态
- `health` 调用 `/trpc/health`，失败提示“请先启动 Tenas”

**Step 4: 图标复制**
- 从 `apps/web/public/head_s.png` 复制到 `apps/wps/assets/tenas-ai.png`

**Step 5: 手动验证**
- 通过 WPS 加载项调试打开 TaskPane，确认页面显示

---

### Task 5: Electron 主进程启动 28888 服务

**Files:**
- Create: `apps/electron/src/main/services/startWpsServer.ts`
- Modify: `apps/electron/src/main/ipc/index.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/web/src/types/electron.d.ts`

**Step 1: 静态服务实现**
- 固定监听 `127.0.0.1:28888`
- 生产环境托管 `apps/wps` 构建产物
- 开发环境可代理到 `apps/wps` dev server

**Step 2: IPC 暴露启动方法**
- 新增 `tenas:wps:start-server` handler
- preload 暴露 `startWpsServer()`

**Step 3: 手动验证**
- 调用 `startWpsServer`，浏览器访问 `/taskpane` 返回页面

---

### Task 6: apps/web 调用链路与双击打开

**Files:**
- Modify: `apps/web/src/components/file/lib/open-file.ts`
- Modify: `apps/web/src/components/setting/menus/BasicSettings.tsx`
- Modify: `apps/web/src/lib/open-wps.ts`
- Add: `apps/web/public/wpsjsrpcsdk.js`

**Step 0: 本地静态加载 WPS SDK**
- 从 `node_modules/wpsjs-rpc-sdk-new/wpsjsrpcsdk.js` 复制到 `apps/web/public/wpsjsrpcsdk.js`
- `open-wps.ts` 默认加载 `"/wpsjsrpcsdk.js"`（避免依赖 58890 端口）
- 备注：后续可用脚本自动复制（例如 `postinstall` / `predev`）

**Step 1: 接入 startWpsServer**
- 双击文件时先调用 `window.tenasElectron.startWpsServer()`

**Step 2: 调用 openFileFromTenas**
- payload：`{ filePath, serverUrl }`
- serverUrl 取 `TENAS_SERVER_URL` 或 runtime ports

**Step 3: 手动验证**
- 双击 Office 文件 -> WPS 被拉起 -> TaskPane 显示

---

### Task 7: 设置项灰化逻辑

**Files:**
- Modify: `apps/web/src/components/setting/menus/BasicSettings.tsx`

**Step 1: 接入检测结果**
- 调用 `window.tenasElectron.getOfficeInstallations()`
- WPS 未安装：禁用 WPS 选项
- Office 未安装：禁用 Office 选项

**Step 2: 手动验证**
- 修改检测结果（临时 mock）确认 UI 灰化

---

### Task 8: 文档与验收清单

**Files:**
- Modify: `docs/plans/2026-01-25-wps-addin-mvp-design.md`

**Step 1: 补充实现状态**
- 标注已实现的入口与文件路径

**Step 2: 最终手动验收**
- 启动 Tenas
- 双击 Office 文件
- WPS 打开成功，TaskPane 显示文件名与 health 状态
