# Relative FS Paths Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert all filesystem (fs) API inputs/outputs to use project/workspace-relative paths instead of `file://` URIs.

**Architecture:** Server resolves relative paths to absolute paths using workspace/project roots, and returns relative paths in every fs response. Client code treats fs `uri` values as relative paths, updates path utilities accordingly, and replaces URL-based path ops with relative path operations.

**Tech Stack:** Next.js (React), tRPC, TypeScript, Node.js fs/path

---

### Task 1: Define relative path helpers (server + client)

**Files:**
- Modify: `packages/api/src/routers/fs.ts`
- Modify: `packages/api/src/services/vfsService.ts`
- Modify: `apps/web/src/components/project/filesystem/utils/file-system-utils.ts`

**Step 1: Write the failing test**

Skipped per user instruction (no automated tests).

**Step 2: Run test to verify it fails**

Skipped per user instruction.

**Step 3: Write minimal implementation**

- Add server helpers for root-path resolution and relative path normalization (POSIX slash, `.` for root).
- Add client helpers to normalize/join/parent relative paths and gracefully handle both relative and legacy `file://` inputs.

**Step 4: Run test to verify it passes**

Skipped per user instruction.

**Step 5: Commit**

Skipped (no commit requested).

---

### Task 2: Update fs router outputs to relative paths

**Files:**
- Modify: `packages/api/src/routers/fs.ts`

**Step 1: Write the failing test**

Skipped per user instruction.

**Step 2: Run test to verify it fails**

Skipped per user instruction.

**Step 3: Write minimal implementation**

- Update `buildFileNode` to return `uri` as relative to the root path.
- Update `stat`, `list`, `search`, `folderThumbnails`, `thumbnails` outputs to use relative `uri`.
- Ensure input `uri` accepts relative paths (root represented as `"."`).

**Step 4: Run test to verify it passes**

Skipped per user instruction.

**Step 5: Commit**

Skipped (no commit requested).

---

### Task 3: Switch client filesystem model to relative `uri`

**Files:**
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`
- Modify: `apps/web/src/components/project/filesystem/utils/file-system-utils.ts`

**Step 1: Write the failing test**

Skipped per user instruction.

**Step 2: Run test to verify it fails**

Skipped per user instruction.

**Step 3: Write minimal implementation**

- Replace URL-based path operations with relative path helpers.
- Ensure all internal navigation (`buildChildUri`, `getRelativePathFromUri`) works with relative paths.

**Step 4: Run test to verify it passes**

Skipped per user instruction.

**Step 5: Commit**

Skipped (no commit requested).

---

### Task 4: Update file system UI components to relative paths

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemColumns.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemGitTree.tsx`
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFileSystemTransferDialog.tsx`
- Modify: `apps/web/src/components/project/filesystem/FolderTreePreview.tsx`

**Step 1: Write the failing test**

Skipped per user instruction.

**Step 2: Run test to verify it fails**

Skipped per user instruction.

**Step 3: Write minimal implementation**

- Replace `new URL(...)` usage with relative path helpers.
- Keep breadcrumb and column path calculations consistent with relative `uri`.
- Ensure root detection uses `""`/ `"."` correctly.

**Step 4: Run test to verify it passes**

Skipped per user instruction.

**Step 5: Commit**

Skipped (no commit requested).

---

### Task 5: Update other fs consumers (sidebar/widgets/viewers)

**Files:**
- Modify: `apps/web/src/components/layout/sidebar/PageTree.tsx`
- Modify: `apps/web/src/components/desktop/widgets/ThreeDFolderWidget.tsx`
- Modify: `apps/web/src/components/file/CodeViewer.tsx`
- Modify: `apps/web/src/components/file/MarkdownViewer.tsx`
- Modify: `apps/web/src/components/file/PdfViewer.tsx`
- Modify: `apps/web/src/components/file/DocViewer.tsx`
- Modify: `apps/web/src/components/file/ImageViewer.tsx`
- Modify: `apps/web/src/components/file/SheetViewer.tsx`
- Modify: `apps/web/src/components/project/filesystem/hooks/use-folder-thumbnails.ts`

**Step 1: Write the failing test**

Skipped per user instruction.

**Step 2: Run test to verify it fails**

Skipped per user instruction.

**Step 3: Write minimal implementation**

- Ensure all fs queries/mutations use relative `uri` values.
- Normalize any existing `file://` inputs from legacy call paths.

**Step 4: Run test to verify it passes**

Skipped per user instruction.

**Step 5: Commit**

Skipped (no commit requested).

---

### Task 6: Manual verification checklist

**Steps:**
- Files tab list/grid/columns/tree navigation works at root and nested levels.
- Breadcrumb shows `/` and navigation works.
- File previews (code/pdf/doc/image/markdown/sheet) still open.
- Transfer dialog list/select/copy/move works.
- Sidebar tree list works and opening files succeeds.

