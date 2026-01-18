# Project Parent Move Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add project parent move controls in ProjectTree (drag-and-drop) and ProjectBasicSettings (buttons + picker) with mandatory confirmation.

**Architecture:** Reuse `project.list` to derive parent/descendant indices and `project.move` to persist changes. Frontend shows a confirmation dialog before calling the mutation; UI refreshes by invalidating the projects list.

**Tech Stack:** Next.js (React), TanStack Query, tRPC, Radix UI Dialog/AlertDialog.

> **Note:** The user explicitly requested no worktree and no tests. This plan still lists test steps for completeness; execution may skip them with user approval.

### Task 1: ProjectTree drag-and-drop + confirm

**Files:**
- Modify: `apps/web/src/components/layout/sidebar/ProjectTree.tsx`
- Test: `apps/web/src/components/layout/sidebar/__tests__/ProjectTreeMove.test.tsx` (new)

**Step 1: Write the failing test**

```tsx
// Test the pure helper that builds parent/descendant indices.
// Expect that descendants are correctly derived for nested projects.
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ProjectTreeMove.test.tsx`  
Expected: FAIL (test runner not configured / helper missing)

**Step 3: Write minimal implementation**

```tsx
// Add project tree index builder, drag state, root drop zone,
// and confirm dialog that calls trpc.project.move on confirm.
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ProjectTreeMove.test.tsx`  
Expected: PASS (or skipped per user request)

**Step 5: Commit**

```bash
git add apps/web/src/components/layout/sidebar/ProjectTree.tsx
git commit -m "feat(web): confirm project move from tree"
```

### Task 2: ProjectBasicSettings parent controls + confirm

**Files:**
- Modify: `apps/web/src/components/project/settings/menus/ProjectBasicSettings.tsx`
- Test: `apps/web/src/components/project/settings/menus/__tests__/ProjectBasicSettingsParent.test.tsx` (new)

**Step 1: Write the failing test**

```tsx
// Test that the parent label renders and buttons open confirm dialog.
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter web test ProjectBasicSettingsParent.test.tsx`  
Expected: FAIL (test runner not configured / UI not implemented)

**Step 3: Write minimal implementation**

```tsx
// Add parent info row, parent picker dialog, and confirm dialog.
// Use project.list to build indices and trpc.project.move to update.
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter web test ProjectBasicSettingsParent.test.tsx`  
Expected: PASS (or skipped per user request)

**Step 5: Commit**

```bash
git add apps/web/src/components/project/settings/menus/ProjectBasicSettings.tsx
git commit -m "feat(web): add parent controls in project settings"
```

### Task 3: Manual verification (if tests skipped)

**Files:**
- Verify: `apps/web/src/components/layout/sidebar/ProjectTree.tsx`
- Verify: `apps/web/src/components/project/settings/menus/ProjectBasicSettings.tsx`

**Step 1: Drag to parent with confirm**

Run: `pnpm dev:web`  
Expected: drag a project onto another → confirm dialog → structure updates after confirm.

**Step 2: Drag to root with confirm**

Expected: drag to root drop zone → confirm → project becomes top-level.

**Step 3: Settings move to parent**

Expected: “更改父项目” → pick parent → confirm → tree updates.

**Step 4: Settings move to root**

Expected: “移到根项目” → confirm → project becomes top-level.

**Step 5: Cancel paths**

Expected: cancel in any confirm dialog → no changes applied.
