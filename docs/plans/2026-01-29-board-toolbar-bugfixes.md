# Board Toolbar Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix board toolbar file picker defaults, multi-select inserts, drag preview visuals, hover rotation, and remove double-click note creation.

**Architecture:** Keep changes localized to board toolbar, file picker dialog, and filesystem drag preview. Reuse existing file-system utilities for path normalization and keep canvas insert logic unchanged except for multiple selections.

**Tech Stack:** React (Next.js), TypeScript, Tailwind CSS, tRPC

**Constraints:** Per project rules, skip TDD test creation/execution and do not create a new worktree.

### Task 1: Fix picker default folder to parent of board folder

**Files:**
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`
- Modify: `apps/web/src/components/project/filesystem/utils/file-system-utils.ts` (only if a new helper is needed)

**Step 1: Document expected behavior (no tests per project rule)**

```text
Open video/image picker from board toolbar; initial folder should be the parent of board folder.
```

**Step 2: Implement minimal code change**

```ts
// Example approach inside BoardToolbar:
// const parentActiveUri = resolveParentUri(fileContext?.rootUri, fileContext?.boardFolderUri);
// defaultActiveUri={parentActiveUri ?? fileContext?.boardFolderUri}
```

**Step 3: Manual check**

Run: open board → click video/image picker → verify default path is parent of board folder.

### Task 2: Support multi-select inserts for video picker (and image if applicable)

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFilePickerDialog.tsx`
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`

**Step 1: Document expected behavior (no tests per project rule)**

```text
Multi-select videos in picker → confirm → multiple video nodes inserted on canvas.
```

**Step 2: Implement minimal code change**

```ts
// Add onSelectFiles?: (selection: ProjectFilePickerSelection[]) => void
// Collect selected file entries on confirm and call onSelectFiles when size > 1.
// Update BoardToolbar to insert one node per selected video.
```

**Step 3: Manual check**

Run: open video picker → multi-select videos → confirm → verify multiple video nodes inserted.

### Task 3: Drag preview uses image/video thumbnails (stacked for multi-select)

**Files:**
- Modify: `apps/web/src/components/project/filesystem/hooks/use-file-system-drag.ts`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemGrid.tsx`

**Step 1: Document expected behavior (no tests per project rule)**

```text
Dragging selected images/videos shows thumbnail preview; multi-select shows stacked preview.
```

**Step 2: Implement minimal code change**

```ts
// Pass a thumbnail resolver into useFileSystemDrag.
// Build a drag preview element using thumbnail data URLs, stack when multiple.
// Fall back to existing card clone if no thumbnails.
```

**Step 3: Manual check**

Run: open picker → drag image/video selection → verify drag image shows preview and stacks.

### Task 4: Reduce toolbar hover rotation to 20 degrees

**Files:**
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`

**Step 1: Implement minimal code change**

```ts
// Replace group-hover:-rotate-45 with group-hover:-rotate-[20deg]
```

**Step 2: Manual check**

Run: hover toolbar insert buttons → verify rotation is 20 degrees.

### Task 5: Remove double-click blank canvas to create TextNode

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasInteraction.tsx`

**Step 1: Implement minimal code change**

```ts
// Remove the empty-canvas double-click branch that creates a text node.
```

**Step 2: Manual check**

Run: double-click on empty canvas → no new text node created; double-click on node still works.
