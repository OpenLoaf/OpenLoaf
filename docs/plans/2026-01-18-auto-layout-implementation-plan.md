# Auto Layout (Board) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a left-toolbar auto layout action that repositions all board nodes using the design spec while respecting locked nodes and group boundaries.

**Architecture:** Implement a pure auto layout module under the board engine, then call it from CanvasEngine to apply a single transaction with history commit. Wire the action to the left toolbar button.

**Tech Stack:** React (Next.js), board engine (CanvasEngine/CanvasDoc), TypeScript.

### Task 1: Auto layout module

**Files:**
- Create: `apps/web/src/components/board/engine/auto-layout.ts`

**Step 1: Define layout data structures and helpers**

```ts
export type AutoLayoutUpdate = {
  id: string;
  xywh: [number, number, number, number];
};
```

**Step 2: Implement graph build + direction detect + layering + ordering + positioning**

```ts
export function computeAutoLayoutUpdates(elements: CanvasElement[]): AutoLayoutUpdate[] {
  // ...see design doc for algorithm steps.
}
```

**Step 3: Manual verification**

Run the app and trigger auto layout on a board with groups/locked nodes to confirm:
- locked nodes stay fixed
- groups move as a whole
- direction auto-detect chooses expected axis

### Task 2: CanvasEngine integration

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts`

**Step 1: Add new method on engine**

```ts
/** Auto layout the entire board. */
autoLayoutBoard(): void {
  // call computeAutoLayoutUpdates and apply in doc.transact
}
```

**Step 2: Manual verification**

Trigger from console or UI; confirm history undo works.

### Task 3: Left toolbar button

**Files:**
- Modify: `apps/web/src/components/board/controls/BoardControls.tsx`

**Step 1: Add icon button labeled "自动布局"**

```tsx
<IconBtn title="自动布局" onPointerDown={handleAutoLayout} ...>
```

**Step 2: Manual verification**

Click the left toolbar button and verify layout updates.

---

**Notes:**
- Per project rule, skip TDD; use manual verification only.
