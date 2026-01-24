# SheetViewer Spreadsheet Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route all spreadsheet extensions to the internal SheetViewer on double-click preview.

**Architecture:** Update the internal spreadsheet extension set used by open-file routing to include all `SPREADSHEET_EXTS`. This flips `shouldOpenOfficeWithSystem` for spreadsheet files so they open with SheetViewer instead of the system default app.

**Tech Stack:** Next.js (apps/web), TypeScript, file preview routing.

> Note: Per project rules, skip TDD/tests and do not create a worktree.

### Task 1: Route spreadsheet extensions to SheetViewer

**Files:**
- Modify: `apps/web/src/components/file/lib/open-file.ts`

**Step 1: Update internal sheet extension set**

Replace:

```ts
const INTERNAL_SHEET_EXTS = new Set(["csv"]);
```

With:

```ts
const INTERNAL_SHEET_EXTS = new Set(SPREADSHEET_EXTS);
```

**Step 2: Skip automated tests (project rule)**

Run: (skipped)

Expected: N/A

**Step 3: Manual verification**

- Double-click an `.xlsx` (or `.numbers/.tsv`) file in the file tree
- Expected: opens `SheetViewer` instead of the system app

**Step 4: Commit**

```bash
git add apps/web/src/components/file/lib/open-file.ts
git commit -m "feat: route spreadsheets to sheet viewer"
```
