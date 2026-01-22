# Unified File Open Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify all file-open behavior so every entry uses the same decision logic and can open in stack or modal, defaulting to stack.

**Architecture:** Introduce a shared open-file module under `apps/web/src/components/file/lib` that resolves viewer targets and delegates to either stack (pushStackItem) or modal (dialog) based on an explicit mode. Replace existing scattered open logic to use this module and ensure projectId/workspaceId flow consistently.

**Tech Stack:** React, Next.js, TypeScript, Zustand (tabs), tRPC, existing file viewers

> Note: Project rule says skip TDD; test steps are marked as skipped.

### Task 1: Add shared open-file module

**Files:**
- Create: `apps/web/src/components/file/lib/open-file.ts`
- Modify: `apps/web/src/components/project/filesystem/utils/entry-open.ts`
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`

**Step 1: Write the failing test (SKIPPED by project rule)**

**Step 2: Run test to verify it fails (SKIPPED)**

**Step 3: Write minimal implementation**
- Move/replicate file-type routing logic into `open-file.ts`.
- Expose `openFile` with mode `"stack" | "modal"` (default stack).
- Provide helpers to open via stack using `pushStackItem` and via modal dialog.
- Update `entry-open.ts` to use `openFile` rather than its own routing.

**Step 4: Run test to verify it passes (SKIPPED)**

**Step 5: Commit**
```bash
git add apps/web/src/components/file/lib/open-file.ts \
  apps/web/src/components/project/filesystem/utils/entry-open.ts \
  apps/web/src/components/project/filesystem/models/file-system-model.ts

git commit -m "refactor: centralize file open logic"
```

### Task 2: Add modal preview container for shared open

**Files:**
- Create: `apps/web/src/components/file/FilePreviewDialog.tsx`
- Modify: `apps/web/src/components/file/ImagePreviewDialog.tsx`

**Step 1: Write the failing test (SKIPPED by project rule)**

**Step 2: Run test to verify it fails (SKIPPED)**

**Step 3: Write minimal implementation**
- Add a generic `FilePreviewDialog` that renders the appropriate viewer component based on open-file targets.
- Keep the dialog full-screen overlay behavior similar to `ImagePreviewDialog`.
- Update `ImagePreviewDialog` to use `FilePreviewDialog` internally or mark it as a thin wrapper if still needed.

**Step 4: Run test to verify it passes (SKIPPED)**

**Step 5: Commit**
```bash
git add apps/web/src/components/file/FilePreviewDialog.tsx \
  apps/web/src/components/file/ImagePreviewDialog.tsx

git commit -m "feat: add unified file preview dialog"
```

### Task 3: Migrate all open-file callers to open-file module

**Files:**
- Modify: `apps/web/src/components/chat/message/tools/MessageFile.tsx`
- Modify: `apps/web/src/components/chat/message/MessageHuman.tsx`
- Modify: `apps/web/src/components/chat/file/ChatImageAttachments.tsx`
- Modify: `apps/web/src/components/board/core/BoardCanvas.tsx`
- Modify: `apps/web/src/components/layout/sidebar/ProjectTree.tsx`
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`
- Modify: `apps/web/src/components/desktop/widgets/ThreeDFolderWidget.tsx`
- Modify: `apps/web/src/lib/chat/mention-pointer.ts`

**Step 1: Write the failing test (SKIPPED by project rule)**

**Step 2: Run test to verify it fails (SKIPPED)**

**Step 3: Write minimal implementation**
- Replace local “open” logic with `openFile` calls.
- Ensure `projectId`, `workspaceId`, `rootUri`, and `tabId` are passed consistently.
- Default mode to `stack`; use `modal` explicitly where overlay is expected (e.g., image previews in chat).
- Remove direct `ImagePreviewDialog` usage where superseded.

**Step 4: Run test to verify it passes (SKIPPED)**

**Step 5: Commit**
```bash
git add apps/web/src/components/chat/message/tools/MessageFile.tsx \
  apps/web/src/components/chat/message/MessageHuman.tsx \
  apps/web/src/components/chat/file/ChatImageAttachments.tsx \
  apps/web/src/components/board/core/BoardCanvas.tsx \
  apps/web/src/components/layout/sidebar/ProjectTree.tsx \
  apps/web/src/components/project/ProjectHistory.tsx \
  apps/web/src/components/desktop/widgets/ThreeDFolderWidget.tsx \
  apps/web/src/lib/chat/mention-pointer.ts

git commit -m "refactor: unify file open callers"
```

### Task 4: Manual verification

**Files:**
- None

**Step 1: Run targeted manual checks**
- Verify file-system double-click opens in stack.
- Verify chat message image opens modal preview.
- Verify projectId is passed for preview requests.

**Step 2: Record results in chat**

