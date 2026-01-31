# Unified Drag Session Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Electron 中用单一拖拽通道实现“拖出到系统 + 应用内移动/引用”的合并行为，并避免拖拽卡死。

**Architecture:** 渲染层在拖拽开始时创建全局 drag session，并只触发原生 `startDrag`；内部 drop 改为读取 drag session（而非 HTML5 dataTransfer），并在 drop/dragend/blur/timeout 时清理 session。

**Tech Stack:** Next.js (React), Electron preload + IPC, TypeScript.

> **Note:** 项目规则要求跳过 TDD 测试、不要创建 worktree；本计划中测试步骤标记为跳过。

---

### Task 1: 新增 drag session 全局模块

**Files:**
- Create: `apps/web/src/lib/project-file-drag-session.ts`

**Step 1: Write the failing test**
- Skip (project rule).

**Step 2: Run test to verify it fails**
- Skip.

**Step 3: Write minimal implementation**
- 定义 `ProjectFileDragSession` 类型与 `set/get/clear/match` 方法
- 内部记录 session + 超时自动清理
- 提供基于 `DataTransfer` 的匹配方法（用于内部 drop 判断）

**Step 4: Run test to verify it passes**
- Skip.

**Step 5: Commit**
- Skip（由用户决定）。

---

### Task 2: 统一 dragstart 逻辑为原生拖拽

**Files:**
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`
- Modify: `apps/web/src/components/project/filesystem/hooks/use-file-system-drag.ts`

**Step 1: Write the failing test**
- Skip.

**Step 2: Run test to verify it fails**
- Skip.

**Step 3: Write minimal implementation**
- Electron 环境 dragstart 调用 `event.preventDefault()`
- 写入 drag session（entryUris/fileRefs/localPaths）
- 只调用 `window.tenasElectron.startDrag`
- Electron 分支不再写 HTML5 `dataTransfer`

**Step 4: Run test to verify it passes**
- Skip.

**Step 5: Commit**
- Skip（由用户决定）。

---

### Task 3: 内部 drop 改用 drag session

**Files:**
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`

**Step 1: Write the failing test**
- Skip.

**Step 2: Run test to verify it fails**
- Skip.

**Step 3: Write minimal implementation**
- `handleEntryDrop` / `handleDrop` 读取 drag session
- 当 drop 数据匹配 session 时，执行内部 move 并清理 session
- 保持外部文件拖入逻辑不变

**Step 4: Run test to verify it passes**
- Skip.

**Step 5: Commit**
- Skip（由用户决定）。

---

### Task 4: ChatInput 支持 drag session 引用插入

**Files:**
- Modify: `apps/web/src/components/chat/input/ChatInput.tsx`

**Step 1: Write the failing test**
- Skip.

**Step 2: Run test to verify it fails**
- Skip.

**Step 3: Write minimal implementation**
- drop 时优先匹配 drag session
- 命中时插入 `fileRefs` 并清理 session

**Step 4: Run test to verify it passes**
- Skip.

**Step 5: Commit**
- Skip（由用户决定）。

---

### Task 5: 清理与兜底

**Files:**
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`

**Step 1: Write the failing test**
- Skip.

**Step 2: Run test to verify it fails**
- Skip.

**Step 3: Write minimal implementation**
- 添加 window 级别 `dragend/blur/visibilitychange/keydown` 清理 session
- 确保 session 超时自动清理

**Step 4: Run test to verify it passes**
- Skip.

**Step 5: Commit**
- Skip（由用户决定）。
