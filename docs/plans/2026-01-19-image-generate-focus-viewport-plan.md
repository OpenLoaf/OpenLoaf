# ImageGenerate Focus Viewport Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the ImageGenerate prompt input receives focus, smoothly pan/zoom the board viewport to center and fit that node.

**Architecture:** Add a generic viewport focus animation method on `CanvasEngine` that accepts a world-rect and animates `zoom/offset`. Trigger it from `ImageGenerateNode` on textarea focus with a small throttle and a panning/zooming guard.

**Tech Stack:** React, TypeScript, custom canvas engine (ViewportController).

### Task 1: Add a generic viewport focus animation helper

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts`
- Modify: `apps/web/src/components/board/engine/viewport-actions.ts`
- Modify: `apps/web/src/components/board/engine/types.ts`

**Step 1: Write the failing test**

Skip automated tests per project rule for superpowers skills. Use manual verification steps in Task 3.

**Step 2: Implement viewport focus animation**

- Add a `focusViewportToRect(rect, options)` method on `CanvasEngine`.
- Compute target zoom/offset for the rect with padding and clamp to zoom limits.
- Animate from current viewport state to target using `requestAnimationFrame` and an ease-out curve.
- Store/cancel any in-flight animation to avoid stacking.
- Do not mutate doc state; only update viewport.

**Step 3: Ensure interaction guard**

- If viewport size is zero or `engine` is currently panning, return early.
- If the target view is already close (small zoom/offset delta), skip animation.

**Step 4: Commit**

Skip commit unless explicitly requested.

### Task 2: Trigger focus on ImageGenerate input

**Files:**
- Modify: `apps/web/src/components/board/nodes/ImageGenerateNode.tsx`

**Step 1: Add focus handler**

- On textarea `onFocus`, call `engine.focusViewportToRect` with node `xywh`.
- Use a `useRef` timestamp to throttle (e.g., 300ms).
- Guard against locked canvas or panning view state before triggering.

**Step 2: Commit**

Skip commit unless explicitly requested.

### Task 3: Manual verification

**Steps:**

1. Open a board with an `image_generate` node.
2. Zoom/pan away so the node is off-center.
3. Click the prompt textarea: node should smoothly move to center and fit.
4. While panning/zooming, focus should not trigger.
5. Re-focus within 300ms should not retrigger animation.

**Step 4: Commit**

Skip commit unless explicitly requested.
