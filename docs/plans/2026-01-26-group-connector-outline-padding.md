# Group Connector Outline Padding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make group connector anchors and line endpoints align with the padded group outline at any zoom, and keep hit-testing/selection consistent.

**Architecture:** Compute group outline padding in screen pixels and convert to world units per zoom. Apply that padding when resolving group bounds and anchors in both the main thread and the WebGPU worker, while keeping raw anchors in the snapshot and only adjusting them at usage sites.

**Tech Stack:** TypeScript, React, WebGPU worker, custom canvas engine.

> Note: Project rule says to skip TDD and worktrees when using superpowers. This plan uses manual verification instead of tests.

### Task 1: Apply group padding in WebGPU connector resolution

**Files:**
- Modify: `apps/web/src/components/board/render/webgpu/board-renderer.worker.ts`

**Step 1: Add group padding helpers**

```ts
import { GROUP_OUTLINE_SCREEN_PADDING, MIN_ZOOM_EPS } from "../../engine/constants";

const GROUP_NODE_TYPES = new Set(["group", "image-group"]);

function getGroupOutlinePadding(zoom: number) {
  const safeZoom = Math.max(zoom, MIN_ZOOM_EPS);
  return GROUP_OUTLINE_SCREEN_PADDING / safeZoom;
}

function resolveAnchorOffset(anchorId: string, padding: number): CanvasPoint {
  switch (anchorId) {
    case "top":
      return [0, -padding];
    case "right":
      return [padding, 0];
    case "bottom":
      return [0, padding];
    case "left":
      return [-padding, 0];
    default:
      return [0, 0];
  }
}

function applyGroupAnchorPadding(
  anchors: GpuSceneSnapshot["anchors"],
  elements: GpuSceneSnapshot["elements"],
  padding: number
) {
  if (padding <= 0) return anchors;
  const next = { ...anchors };
  elements.forEach(element => {
    if (element.kind !== "node") return;
    if (!GROUP_NODE_TYPES.has(element.type)) return;
    const list = anchors[element.id];
    if (!list) return;
    next[element.id] = list.map(anchor => {
      const offset = resolveAnchorOffset(anchor.id, padding);
      return { ...anchor, point: [anchor.point[0] + offset[0], anchor.point[1] + offset[1]] };
    });
  });
  return next;
}
```

**Step 2: Expand bounds for group nodes**

```ts
function getNodeBoundsMap(elements: GpuSceneSnapshot["elements"], groupPadding: number) {
  const bounds: Record<string, CanvasRect | undefined> = {};
  elements.forEach(element => {
    if (element.kind !== "node") return;
    const [x, y, w, h] = element.xywh;
    const padding = GROUP_NODE_TYPES.has(element.type) ? groupPadding : 0;
    bounds[element.id] = { x: x - padding, y: y - padding, w: w + padding * 2, h: h + padding * 2 };
  });
  return bounds;
}
```

**Step 3: Use padded anchors/bounds in connector rendering**

```ts
const groupPadding = getGroupOutlinePadding(view.viewport.zoom);
const anchors = applyGroupAnchorPadding(scene.anchors, scene.elements, groupPadding);
const boundsMap = getNodeBoundsMap(scene.elements, groupPadding);
```

Use `anchors` and `boundsMap` for both `appendConnectorLines` and draft connector resolution.

### Task 2: Apply group padding in engine connector logic

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts`

**Step 1: Add a helper for padded anchors**

```ts
private getAnchorMapWithGroupPadding(): CanvasAnchorMap {
  const { zoom } = this.viewport.getState();
  const groupPadding = getGroupOutlinePadding(zoom);
  return applyGroupAnchorPadding(this.getAnchorMap(), this.doc.getElements(), groupPadding);
}
```

**Step 2: Use padded anchors for connector operations**

Update these call sites to use `getAnchorMapWithGroupPadding()`:
- `addConnectorElement`
- `updateConnectorEndpoint`
- `findAnchorHit`
- `findConnectorEndpointHit`
- `pickElementAt`
- `pasteClipboard` (the `getAnchorMap` option passed into `buildPastedElements`)

**Step 3: Expand group bounds for connector resolution**

```ts
private getNodeBoundsById = (elementId: string): CanvasRect | undefined => {
  const element = this.doc.getElementById(elementId);
  if (!element || element.kind !== "node") return undefined;
  const [x, y, w, h] = element.xywh;
  if (!isGroupNodeType(element.type)) return { x, y, w, h };
  const { zoom } = this.viewport.getState();
  const padding = getGroupOutlinePadding(zoom);
  return { x: x - padding, y: y - padding, w: w + padding * 2, h: h + padding * 2 };
};
```

### Task 3: Manual verification (no TDD per project rule)

**Steps:**
1. `pnpm dev` (or `pnpm dev:web`) and open the board.
2. Create a group with visible padding and connect an external node to the group.
3. Verify connector endpoints sit on the padded border (not the inner child bounds).
4. Hover group: anchors should appear on the padded border and be hittable.
5. Zoom in/out: border padding stays visually constant in screen pixels and connectors remain aligned.

**Commit (optional, only if user requests):**
```bash
git add apps/web/src/components/board/render/webgpu/board-renderer.worker.ts \
  apps/web/src/components/board/engine/CanvasEngine.ts
git commit -m "fix: align group connectors with padded outline"
```
