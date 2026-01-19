# Board Thumbnail Capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture a 320x200 `index.png` thumbnail when closing a board and 30s after auto layout, and display it as the board folder thumbnail in the file system UI.

**Architecture:** Reuse the existing html-to-image board export settings to capture the board DOM, downscale to a fixed 320x200 PNG, and write to the board folder via `trpc.fs.writeBinary`. Extend `fs.folderThumbnails` to return board folder thumbnails keyed by folder URI so UI components can display the `index.png` preview.

**Tech Stack:** React, TypeScript, html-to-image, TanStack Query, tRPC, sharp (server thumbnails)

### Task 1: Shared board export helpers

**Files:**
- Create: `apps/web/src/components/board/utils/board-export.ts`
- Modify: `apps/web/src/components/board/BoardPanelHeaderActions.tsx`

**Step 1: Write the failing test**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 2: Run test to verify it fails**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 3: Write minimal implementation**
Add shared helpers for board export: ignore selectors, export-mode toggle, frame wait, and html-to-image blob capture.

**Step 4: Run test to verify it passes**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 5: Commit**
```bash
git add apps/web/src/components/board/utils/board-export.ts apps/web/src/components/board/BoardPanelHeaderActions.tsx
git commit -m "refactor: share board export helpers"
```

### Task 2: Board thumbnail capture on close and auto-layout delay

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvas.tsx`
- Modify: `apps/web/src/components/board/core/BoardCanvasRender.tsx`
- Modify: `apps/web/src/components/board/controls/BoardControls.tsx`

**Step 1: Write the failing test**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 2: Run test to verify it fails**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 3: Write minimal implementation**
Wire an `onAutoLayout` callback from `BoardCanvas` to `BoardControls`, schedule a 30s delayed capture, and capture on unmount. Generate a 320x200 PNG via offscreen canvas and write to `boardFolderUri/index.png`.

**Step 4: Run test to verify it passes**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 5: Commit**
```bash
git add apps/web/src/components/board/core/BoardCanvas.tsx apps/web/src/components/board/core/BoardCanvasRender.tsx apps/web/src/components/board/controls/BoardControls.tsx
git commit -m "feat: save board thumbnail on close and auto layout"
```

### Task 3: Use index.png for board folder thumbnails

**Files:**
- Modify: `packages/api/src/routers/fs.ts`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemEntryVisual.tsx`

**Step 1: Write the failing test**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 2: Run test to verify it fails**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 3: Write minimal implementation**
Extend `folderThumbnails` to detect board folders and read `index.png` when present, returning the thumbnail keyed by folder URI. In the UI, prefer thumbnail images for board folders before falling back to the board icon.

**Step 4: Run test to verify it passes**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 5: Commit**
```bash
git add packages/api/src/routers/fs.ts apps/web/src/components/project/filesystem/components/FileSystemEntryVisual.tsx
git commit -m "feat: show board folder thumbnails from index.png"
```

### Task 4: Manual verification

**Files:**
- None

**Step 1: Write the failing test**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 2: Run test to verify it fails**
Skipped (project rule: superpowers skills skip TDD tests).

**Step 3: Write minimal implementation**
N/A

**Step 4: Run test to verify it passes**
Manual check:
1) Open a board and click the auto layout button.
2) Wait 30 seconds and confirm `index.png` exists in the board folder.
3) Close the board and confirm `index.png` updates.
4) In the file system view, ensure the board folder shows the thumbnail.

**Step 5: Commit**
Skipped (verification only).
