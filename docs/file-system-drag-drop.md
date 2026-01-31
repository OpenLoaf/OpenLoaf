# 文件系统拖拽逻辑（FileSystem Drag & Drop）

本文档描述当前 Tenas 中文件系统拖拽的实现，覆盖 **应用内移动/引用** 与 **拖出到系统** 的合并逻辑，以及 Electron / Web 差异。

## 范围

- 文件系统列表/网格/树：拖拽移动、拖拽到系统
- ChatInput：拖拽插入文件引用
- Electron 原生拖拽（`startDrag`）

不涵盖：OS → 应用内导入流程的详细实现（但在 drop 处有入口说明）。

---

## 核心思路

**Electron 下只保留原生拖拽通道**：
- `dragstart` 中调用 `event.preventDefault()` 取消 HTML5 拖拽，避免 Chromium 拖拽状态悬挂导致 UI 卡死。
- 同时写入一个全局 **drag session**（记录条目、项目、路径等）。
- 内部 drop 时不再依赖 `dataTransfer`，而是读取 drag session 完成移动/引用。

**Web 下保持 HTML5 拖拽通道**：
- `dataTransfer` + `FILE_DRAG_*` 方案保持不变。

---

## 关键模块

### 1) Drag Session

文件：`apps/web/src/lib/project-file-drag-session.ts`

用途：在 Electron 原生拖拽时保存拖拽上下文，使内部 drop 能恢复“来自哪个条目”。

结构：
- `id`: session id
- `projectId`: 项目 id
- `rootUri`: 项目根（可选）
- `entryUris`: 文件系统内条目 uri（相对路径）
- `fileRefs`: chat 插入用的 `@[...]` 绝对引用
- `localPaths`: 系统绝对路径，用于 native 拖拽
- `createdAt`: 生成时间

能力：
- `setProjectFileDragSession(session, ttlMs)`：写入并设置超时清理（默认 30s）
- `getProjectFileDragSession()`：直接取当前 session
- `clearProjectFileDragSession(reason)`：清理并广播事件
- `matchProjectFileDragSession(dataTransfer)`：用于 drop 时根据 `dataTransfer` 内容进行匹配

注意：Electron 原生拖拽进入时 `dataTransfer` 可能为空，所以 **overlay 判断必须用 `getProjectFileDragSession`**。

---

## 文件系统拖拽流程

### A) dragstart

入口：`apps/web/src/components/project/filesystem/models/file-system-model.ts`

- Electron 环境：
  1. `event.preventDefault()`
  2. 生成 `localPaths`（`resolveFileUriFromRoot` + `getDisplayPathFromUri`）
  3. 生成 `fileRefs`（`formatScopedProjectPath`）
  4. `setProjectFileDragSession(...)`
  5. `window.tenasElectron.startDrag({ uris })`

- 非 Electron：
  - 写入 `FILE_DRAG_REF_MIME` / `FILE_DRAG_URIS_MIME`
  - `setImageDragPayload`（图片拖拽预览/引用）

### B) 拖拽预览

文件：`apps/web/src/components/project/filesystem/hooks/use-file-system-drag.ts`

- Electron：**不写入 `dataTransfer`**，仅触发 `onEntryDragStart`。
- Web：使用 `setDragImage` + image payload。

### C) 拖拽覆盖层（“松开鼠标即可添加文件”）

文件：`apps/web/src/components/project/filesystem/models/file-system-model.ts`

- `handleDragEnter/Over/Leave` 中：
  - 如 `FILE_DRAG_REF_MIME` 存在，视为内部拖拽 → **不显示 overlay**
  - Electron 时优先检查 `getProjectFileDragSession()`：
    - 命中同 projectId → **不显示 overlay**
  - 仅在 **外部文件拖入** 时显示 overlay

---

## drop 处理

### 1) 目标是文件夹条目（Entry Drop）

入口：`handleEntryDrop`

- 优先使用 HTML5 内部拖拽数据：
  - 读取 `FILE_DRAG_URIS_MIME` 或 `FILE_DRAG_URI_MIME`
- 若无内部 ref 且 Electron：
  - 使用 drag session（`matchProjectFileDragSession`）
  - 使用 `fileRefs` 或 `entryUris`
- 统一调用 `moveEntriesByUris` 完成移动
- 成功后清理 drag session（若来自 session）

### 2) 目标是列表空白（Background Drop）

入口：`handleDrop`

- Electron 下优先使用 drag session：
  - 命中则按“内部移动”处理（目标为当前目录）
  - **同目录放手不做任何操作**（避免重复重命名）
- 若为外部拖入：走原有导入逻辑（图片 payload / 文件上传）

---

## ChatInput 拖拽

文件：`apps/web/src/components/chat/input/ChatInput.tsx`

- `handleDrop` 首先检查 drag session：
  - session projectId === defaultProjectId
  - 直接插入 `session.fileRefs`
  - 清理 session
- 未命中 session 时，使用原有 image payload / 附件逻辑

---

## Selection 规则（修复多选拖拽 Bug）

文件：`apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx`

- `handleEntryDragStart`：
  - 若拖拽的条目 **不在当前选择中** → 直接 `replaceSelection([uri])`
  - 若已选中 → 保留多选（可拖拽多个）

避免出现“拖拽未选中项时自动变成多选”的问题。

---

## Electron 主进程拖拽

文件：`apps/electron/src/main/ipc/index.ts`

- IPC：`tenas:fs:start-drag`
- 主进程逻辑：
  - 解析 `uris` → 绝对路径
  - `app.getFileIcon(path)` 作为拖拽图标
  - 单文件：`event.sender.startDrag({ file, icon })`
  - 多文件：`event.sender.startDrag({ files, icon })`
  - 失败时回退到应用 icon 或 1x1 兜底 icon

---

## 清理与兜底

文件：`apps/web/src/components/project/filesystem/models/file-system-model.ts`

- Electron 环境：
  - `dragend` / `drop` / `blur` / `visibilitychange(hidden)` / `Escape` 清理 session
- Session 超时：默认 30 秒自动清理

---

## 关键日志

- Renderer：`[drag-out] renderer dragstart/startDrag`
- Preload：`[drag-out] preload send`
- Main：`[drag-out] main log`（received / pre-start / started / tick）

用于排查 IPC 与拖拽阻塞问题。

---

## 当前已解决问题记录

- **Electron 拖出卡死**：通过 `preventDefault + session` 解决
- **拖拽 overlay 误出现**：使用 `getProjectFileDragSession()` 判断
- **松手导致同目录重命名**：同目录 drop 直接 no-op
- **拖拽未选中项导致多选**：拖拽开始时替换选择

