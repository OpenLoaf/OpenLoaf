# Unified File Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify all file preview/open paths under a single entry in `open-file.ts`, supporting stack, modal (fullscreen), and embed rendering.

**Architecture:** Add a single `openFilePreview` API that resolves viewer targets once, dispatches to stack/modal, and returns embedded ReactNode via a shared renderer. Replace existing preview content routing to call the unified entry so behavior is consistent.

**Tech Stack:** Next.js (React), TypeScript, Zustand (preview store), existing file viewers.

---

> Note: Project rule says skip TDD tests when running superpowers skills. Steps below reference tests as optional and should be skipped unless explicitly requested.

### Task 1: Extend unified entry in `open-file.ts`

**Files:**
- Modify: `apps/web/src/components/file/lib/open-file.ts`

**Step 1: Add the new `FileOpenMode` union and `openFilePreview` signature**

```ts
export type FileOpenMode = "stack" | "modal" | "embed";

export type UnifiedFileOpenInput = FileOpenInput & {
  mode: FileOpenMode;
  readOnly?: boolean;
};

export function openFilePreview(input: UnifiedFileOpenInput): ReactNode | null | void {
  // implementation
}
```

**Step 2: Add `renderPreviewContent` helper inside `open-file.ts`**

```ts
function renderPreviewContent(input: {
  entry: FileSystemEntry;
  rootUri?: string;
  projectId?: string;
  readOnly?: boolean;
}): ReactNode {
  // viewer mapping identical to old FileSystemEntryPreviewContent
}
```

**Step 3: Implement unified routing**
- Handle board folder/index mapping.
- Handle folder navigation via `onNavigate`.
- Use `resolveFileViewerTarget` to select viewer.
- For office / unsupported types, use `shouldOpenOfficeWithSystem` + confirm, then `openWithDefaultApp`.
- For `mode === "embed"`, return `renderPreviewContent(...)`.
- For `mode === "modal"`, call `openFilePreviewStore` (existing `openFilePreview` in store) with `buildPreviewPayload`.
- For `mode === "stack"`, use `buildStackItemForEntry` + `useTabs`.

**Step 4: Optional tests (skip unless requested)**
Run: `pnpm check-types`
Expected: PASS

**Step 5: Commit**
```bash
git add apps/web/src/components/file/lib/open-file.ts
git commit -m "feat: unify file preview entry"
```

### Task 2: Migrate embedded preview to unified entry

**Files:**
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemEntryPreviewContent.tsx`

**Step 1: Replace internal viewer routing with unified entry**

```tsx
const content = openFilePreview({
  entry,
  rootUri,
  projectId,
  readOnly,
  mode: "embed",
});
return <>{content}</>;
```

**Step 2: Remove now-unused imports and helper functions**

**Step 3: Optional tests (skip unless requested)**
Run: `pnpm check-types`
Expected: PASS

**Step 4: Commit**
```bash
git add apps/web/src/components/project/filesystem/components/FileSystemEntryPreviewContent.tsx
git commit -m "refactor: embed preview uses unified entry"
```

### Task 3: Route open behavior through unified entry

**Files:**
- Modify: `apps/web/src/components/project/filesystem/utils/entry-open.ts`

**Step 1: Replace direct viewer routing with `openFilePreview`**
- Keep confirm/open/system logic.
- For files call `openFilePreview({ mode: "stack", ... })` or use provided handlers as needed.

**Step 2: Ensure callers still pass needed handlers**
- Verify `FileSystemColumns.tsx` and `FileSystemList.tsx` still provide needed callbacks, no behavior regression.

**Step 3: Optional tests (skip unless requested)**
Run: `pnpm check-types`
Expected: PASS

**Step 4: Commit**
```bash
git add apps/web/src/components/project/filesystem/utils/entry-open.ts
git commit -m "refactor: open actions use unified preview entry"
```

### Task 4: Sanity verification

**Files:**
- None (runtime check)

**Step 1: Manual verification**
- Preview panel shows correct viewer for images/markdown/code/pdf.
- Double click still opens stack view.
- Unsupported office file triggers confirm and system open.

**Step 2: Optional tests (skip unless requested)**
Run: `pnpm check-types`
Expected: PASS

**Step 3: Commit (if needed)**
```bash
git add -A
git commit -m "chore: verify unified preview behavior"
```
