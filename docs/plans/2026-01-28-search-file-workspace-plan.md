# Search File + Workspace Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file/folder search results in the search dialog, with workspace-wide search when project scope is cleared.

**Architecture:** Introduce a `fs.searchWorkspace` API to aggregate project searches and return project metadata. Update the search dialog to query project-scoped or workspace-scoped search based on scope state, render results, and open files/folders via existing navigation helpers.

**Tech Stack:** React, TypeScript, tRPC, Node fs.

## Notes
- Per project rules, skip TDD and do not create a worktree; operate on the current branch.
- Per user request, do not create git commits.

### Task 1: Add workspace-level search API

**Files:**
- Modify: `packages/api/src/routers/fs.ts`

**Step 1: Define input/output shape**
- Add a `fsSearchWorkspaceSchema` with `{ workspaceId, query, includeHidden?, limit?, maxDepth? }`.
- Define result items with `projectId`, `projectTitle`, `entry`, `relativePath`.

**Step 2: Implement aggregation**
- Load project trees via `readWorkspaceProjectTrees(workspaceId)`.
- For each project, search within its root and collect matches.
- Respect `limit` and `maxDepth`, skip hidden/ignored names, and compute `isEmpty` for folders.

**Step 3: Manual verification**
- Call the API (via UI) and confirm it returns entries with project metadata.

### Task 2: Render file search results in Search dialog

**Files:**
- Modify: `apps/web/src/components/search/Search.tsx`

**Step 1: Wire queries**
- Add debounced search value and query hooks.
- If `scopedProjectId` exists, call `trpc.fs.search` with project scope.
- If scope is cleared, call `trpc.fs.searchWorkspace`.

**Step 2: Build result list**
- Map API results to `FileSystemEntry` objects.
- Render a new `CommandGroup` for file results using `CommandItem`.
- Show file icon (via `getEntryVisual`), file/folder name, and a path subtitle (`projectTitle / relativePath`).

**Step 3: Handle selection**
- On file click, call `openFilePreview({ entry, mode: "stack", tabId, projectId, rootUri })` and close search.
- On folder click, ensure project tab exists, then set `{ projectTab: "files", fileUri }` in base params and close search.

**Step 4: Manual verification**
- Project-scoped search returns results; file opens in stack preview.
- Workspace search returns mixed-project results; folder navigation switches to correct project and location.
