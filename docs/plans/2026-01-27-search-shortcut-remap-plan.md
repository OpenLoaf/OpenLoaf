# Search Shortcut Remap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remap search to `Mod+F` and move all existing `Cmd+F/Ctrl+F` usages to `Cmd+K/Ctrl+K` in the web app.

**Architecture:** Update the global shortcut handler and user-facing shortcut labels. Ensure board fullscreen toggle and file system search labels reflect the new mapping without altering existing behavior.

**Tech Stack:** React, TypeScript, Next.js.

## Notes
- Per project rules, skip TDD and do not create a worktree; operate on the current branch.

### Task 1: Global search shortcut remap

**Files:**
- Modify: `apps/web/src/lib/globalShortcuts.ts`

**Step 1: Update shortcut definitions**
- Change `GLOBAL_SHORTCUTS` search entry from `Mod+K` to `Mod+F`.

**Step 2: Update global keydown handler**
- Change the search toggle condition from `keyLower === "k"` to `keyLower === "f"`.

**Step 3: Manual verification**
- Run the app and confirm `Cmd+F/Ctrl+F` opens search; `Cmd+K/Ctrl+K` no longer opens search.

### Task 2: Board fullscreen shortcut remap

**Files:**
- Modify: `apps/web/src/components/board/BoardPanelHeaderActions.tsx`

**Step 1: Update shortcut label**
- Change label text from `Cmd+F/Ctrl+F` to `Cmd+K/Ctrl+K`.

**Step 2: Update keydown interception**
- Replace the `Command+F` handling with `Command+K`.

**Step 3: Manual verification**
- With a board active, confirm `Cmd+K/Ctrl+K` toggles fullscreen and `Cmd+F/Ctrl+F` does not.

### Task 3: File system search label remap

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx`

**Step 1: Update label**
- Replace `⌘F/Ctrl F` display with `⌘K/Ctrl K`.

**Step 2: Manual verification**
- Confirm the UI label matches the new shortcut mapping.
