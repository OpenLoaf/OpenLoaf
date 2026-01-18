# Chat Preface Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a settings-controlled "View Preface" button that opens a Markdown stack showing the current chat session preface.

**Architecture:** Persist a new `chatPrefaceEnabled` flag in basic config, add a chat router query to fetch session preface text, and render it in a `markdown-viewer` stack using inline content mode.

**Tech Stack:** Next.js (React), tRPC, Prisma, TanStack Query.

### Task 1: Add basic config flag + settings toggle

**Files:**
- Modify: `packages/api/src/types/basic.ts`
- Modify: `apps/server/src/modules/settings/tenasConfStore.ts`
- Modify: `apps/server/src/modules/settings/settingsService.ts`
- Modify: `apps/web/src/hooks/use-basic-config.ts`
- Modify: `apps/web/src/components/setting/menus/TestSetting.tsx`

**Step 1: Write the failing test**

```ts
// Skipped: project rule disables TDD tests for this task.
```

**Step 2: Run test to verify it fails**

```bash
# Skipped: no automated tests requested.
```

**Step 3: Write minimal implementation**

```ts
// Add chatPrefaceEnabled to BasicConfig schema/defaults,
// normalize in server settings, and render toggle in TestSetting.
```

**Step 4: Run test to verify it passes**

```bash
# Skipped: no automated tests requested.
```

**Step 5: Commit**

```bash
# Skipped: commit only on request.
```

### Task 2: Add session preface query + ChatHeader button

**Files:**
- Modify: `packages/api/src/routers/chat.ts`
- Modify: `apps/web/src/components/chat/ChatHeader.tsx`

**Step 1: Write the failing test**

```ts
// Skipped: project rule disables TDD tests for this task.
```

**Step 2: Run test to verify it fails**

```bash
# Skipped: no automated tests requested.
```

**Step 3: Write minimal implementation**

```ts
// Add chat.getSessionPreface query returning plain text, and
// add a View button that fetches preface and opens a markdown-viewer stack.
```

**Step 4: Run test to verify it passes**

```bash
# Skipped: no automated tests requested.
```

**Step 5: Commit**

```bash
# Skipped: commit only on request.
```

### Task 3: Add inline content support to MarkdownViewer

**Files:**
- Modify: `apps/web/src/components/file/MarkdownViewer.tsx`

**Step 1: Write the failing test**

```ts
// Skipped: project rule disables TDD tests for this task.
```

**Step 2: Run test to verify it fails**

```bash
# Skipped: no automated tests requested.
```

**Step 3: Write minimal implementation**

```ts
// Add content prop, bypass file query when present, and disable edit controls.
```

**Step 4: Run test to verify it passes**

```bash
# Skipped: no automated tests requested.
```

**Step 5: Commit**

```bash
# Skipped: commit only on request.
```
