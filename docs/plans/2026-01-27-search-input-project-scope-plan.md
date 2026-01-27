# Search Input Project Scope UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a project scope label to the search input with `/` separator and allow clearing via delete/backspace, UI-only.

**Architecture:** Create a dedicated `SearchInput` component to wrap `cmdk` input markup and render project scope UI. Wire it into `Search.tsx` with local state and project resolution from active tab + project list.

**Tech Stack:** React, TypeScript, cmdk, TanStack Query.

## Notes
- Per project rules, skip TDD and do not create a worktree; operate on the current branch.

### Task 1: Build SearchInput UI component

**Files:**
- Create: `apps/web/src/components/search/SearchInput.tsx`

**Step 1: Implement UI wrapper**
- Build a component that renders the input wrapper structure similar to `CommandInput`.
- Add a left-side slot that shows search icon, project name, and `/` separator.
- Accept props for `value`, `onValueChange`, `placeholder`, `projectTitle`, and `onClearProject`.

**Step 2: Implement delete-to-clear logic**
- When input is empty and a project is scoped, intercept Backspace/Delete and call `onClearProject`.

**Step 3: Manual verification**
- Render component in isolation (via Search dialog) and confirm UI layout matches existing styling.

### Task 2: Wire SearchInput into Search dialog

**Files:**
- Modify: `apps/web/src/components/search/Search.tsx`

**Step 1: Resolve current project**
- Use `useTabs`, `useTabRuntime`, and `useProjects` + `buildProjectHierarchyIndex()` to find active project id and title.
- Prefer `runtime.base.params.projectId`, fallback to `tab.chatParams.projectId`.

**Step 2: Manage scope state**
- Add local state: `searchValue`, `scopedProjectId`, `projectCleared`.
- On open, if not cleared, set `scopedProjectId` from active tab.
- On close, reset states.

**Step 3: Connect SearchInput**
- Replace `CommandInput` with `SearchInput` and pass `projectTitle` and `onClearProject`.

**Step 4: Manual verification**
- Open search and confirm project name + `/` is visible.
- Clear input and press Backspace/Delete to remove project label.
- Close and reopen search to restore current project scope.
