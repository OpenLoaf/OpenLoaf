# File System Drag-Out Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable dragging single/multiple files or folders from the in-app file system to the OS in Electron.

**Architecture:** Use Electron `webContents.startDrag` from the main process. The renderer sends selected entry URIs via IPC on dragstart. For multi-select, main copies items to a temp directory (macOS included) and starts drag with the copied paths. Internal drag-and-drop continues to use existing HTML5 dataTransfer payloads.

**Tech Stack:** Electron IPC (main/preload), React (Next.js), TypeScript.

### Task 1: Add Electron drag-start IPC API

**Files:**
- Modify: `apps/electron/src/main/ipc/index.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/web/src/types/electron.d.ts`

**Step 1: Add main-process handler**
- Implement `tenas:fs:start-drag` handler that accepts `{ uris: string[] }`.
- Resolve local paths, select a non-empty drag icon (prefer `app.getFileIcon`, fallback to window icon), and call `event.sender.startDrag({ files, icon })`.
- For multi-select, copy each source to a temp directory (macOS included) and drag the copied paths.
- Schedule temp cleanup.

**Step 2: Expose preload API**
- Add `startDrag` to `window.tenasElectron`.

**Step 3: Update renderer types**
- Extend `apps/web/src/types/electron.d.ts` with `startDrag` signature.

**Step 4: Manual verification (no automated tests per project rule)**
- In Electron app: drag single file to Finder/Desktop.
- Drag multiple items (files + folders) to Finder/Desktop and verify copies appear.

### Task 2: Wire dragstart from file system UI to IPC

**Files:**
- Modify: `apps/web/src/components/project/filesystem/hooks/use-file-system-drag.ts`
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx`
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemGrid.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemList.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemColumns.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemGitTree.tsx`

**Step 1: Pass selected drag entries to callback**
- Update `use-file-system-drag` to call `onEntryDragStart` with the normalized entry list (not just single entry).
- Update props and handlers across grid/list/columns/tree components to match new signature.

**Step 2: Trigger Electron startDrag**
- Update `ProjectFileSystem` to forward entry list to the model.
- Update `file-system-model` dragstart handler to:
  - Preserve existing internal drag MIME handling.
  - If Electron, call `window.tenasElectron.startDrag({ uris })` with entry URIs.

**Step 3: Manual verification (no automated tests per project rule)**
- Verify internal drag/drop within the file system still works.
- Verify drag-out to OS works from grid/list/columns/tree views.

---

Plan complete and saved to `docs/plans/2026-01-29-filesystem-drag-out.md`.

Two execution options:
1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
