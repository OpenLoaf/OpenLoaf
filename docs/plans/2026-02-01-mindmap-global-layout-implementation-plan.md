# Mindmap Global Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a global AFFiNE-like mindmap experience using existing nodes/connectors, with automatic tree layout, keyboard creation, collapse/expand, branch color inheritance, and cycle prevention.

**Architecture:** Build a tree layout module that derives parent/child from connector direction, then integrate it into CanvasEngine so layout runs on relevant mutations. Extend connector rendering to support per-connector colors and add UI to edit them. Add text-node-only keyboard/drag interactions for reparenting and collapse controls.

**Tech Stack:** Next.js (React), canvas engine in TypeScript, SVG connector rendering, Sonner toast.

> Note: Per project rules, skip TDD/testing steps and do not create a worktree.

---

### Task 1: Add mindmap constants and connector color types

**Files:**
- Modify: `apps/web/src/components/board/engine/constants.ts`
- Modify: `apps/web/src/components/board/engine/types.ts`

**Step 1: Add mindmap spacing + branch palette constants**

```ts
// apps/web/src/components/board/engine/constants.ts
export const MINDMAP_NODE_VERTICAL_SPACING = 45;
export const MINDMAP_NODE_HORIZONTAL_SPACING = 110;
export const MINDMAP_FIRST_LEVEL_HORIZONTAL_SPACING = 200;
export const MINDMAP_BRANCH_COLORS = [
  "#111827",
  "#1d4ed8",
  "#f59e0b",
  "#ef4444",
  "#16a34a",
];
```

**Step 2: Extend connector draft/element types**

```ts
// apps/web/src/components/board/engine/types.ts
export type CanvasConnectorElement = CanvasElementBase & {
  kind: "connector";
  source: CanvasConnectorEnd;
  target: CanvasConnectorEnd;
  style?: CanvasConnectorStyle;
  color?: string;
};

export type CanvasConnectorDraft = {
  source: CanvasConnectorEnd;
  target: CanvasConnectorEnd;
  style?: CanvasConnectorStyle;
  color?: string;
};
```

**Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/constants.ts \
  apps/web/src/components/board/engine/types.ts
git commit -m "feat(board): add mindmap constants and connector color type"
```

---

### Task 2: Render connector color + add color picker to connector panel

**Files:**
- Modify: `apps/web/src/components/board/render/SvgConnectorLayer.tsx`
- Modify: `apps/web/src/components/board/ui/CanvasPanels.tsx`
- Modify: `apps/web/src/components/board/core/BoardCanvasRender.tsx`
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts`

**Step 1: Render connector color when available**

```tsx
// apps/web/src/components/board/render/SvgConnectorLayer.tsx
const baseColor = item.color ?? "var(--canvas-connector)";
const strokeColor = item.selected
  ? "var(--canvas-connector-selected)"
  : item.hovered
    ? "var(--canvas-connector-selected)"
    : baseColor;
```

**Step 2: Add engine API to set connector color**

```ts
// apps/web/src/components/board/engine/CanvasEngine.ts
setConnectorColor(color: string, options?: { applyToSelection?: boolean }): void {
  const applyToSelection = options?.applyToSelection ?? true;
  if (!applyToSelection) {
    this.emitChange();
    return;
  }
  const selectedIds = this.selection.getSelectedIds();
  const connectorIds = selectedIds.filter(id => {
    const element = this.doc.getElementById(id);
    return element?.kind === "connector";
  });
  if (connectorIds.length === 0) {
    this.emitChange();
    return;
  }
  this.doc.transact(() => {
    connectorIds.forEach(id => {
      this.doc.updateElement(id, { color });
    });
  });
  this.commitHistory();
}
```

**Step 3: Add color swatches to connector action panel**

```tsx
// apps/web/src/components/board/ui/CanvasPanels.tsx
import { MINDMAP_BRANCH_COLORS } from "../engine/constants";

// Add new prop on ConnectorActionPanel:
// onColorChange: (color: string) => void

{MINDMAP_BRANCH_COLORS.map(color => (
  <button
    key={color}
    type="button"
    onPointerDown={event => {
      event.preventDefault();
      event.stopPropagation();
      onColorChange(color);
    }}
    className="h-6 w-6 rounded-full border border-slate-200/60"
    style={{ backgroundColor: color }}
    title={`连线颜色 ${color}`}
  />
))}
```

**Step 4: Wire handler from BoardCanvasRender**

```tsx
// apps/web/src/components/board/core/BoardCanvasRender.tsx
<ConnectorActionPanel
  ...
  onColorChange={(color) => engine.setConnectorColor(color)}
/>
```

**Step 5: Commit**

```bash
git add apps/web/src/components/board/render/SvgConnectorLayer.tsx \
  apps/web/src/components/board/ui/CanvasPanels.tsx \
  apps/web/src/components/board/core/BoardCanvasRender.tsx \
  apps/web/src/components/board/engine/CanvasEngine.ts
git commit -m "feat(board): support connector color and UI picker"
```

---

### Task 3: Mindmap layout module (tree layout)

**Files:**
- Create: `apps/web/src/components/board/engine/mindmap-layout.ts`

**Step 1: Implement tree layout helpers**

```ts
// apps/web/src/components/board/engine/mindmap-layout.ts
import type { CanvasConnectorElement, CanvasElement, CanvasNodeElement } from "./types";
import {
  MINDMAP_FIRST_LEVEL_HORIZONTAL_SPACING,
  MINDMAP_NODE_HORIZONTAL_SPACING,
  MINDMAP_NODE_VERTICAL_SPACING,
} from "./constants";

export type MindmapLayoutUpdate = {
  id: string;
  xywh: [number, number, number, number];
};

export type MindmapLayoutDirection = "right" | "left" | "balanced";

export function computeMindmapLayout(
  elements: CanvasElement[],
  direction: MindmapLayoutDirection
): { updates: MindmapLayoutUpdate[]; ghostUpdates: MindmapLayoutUpdate[] } {
  // Build node/edge maps, detect multi-parent, build roots, skip collapsed nodes.
  // Use AFFiNE-like subtree sizing, then layout children with fixed spacing.
  // Return updates for real nodes and ghost nodes separately.
  return { updates: [], ghostUpdates: [] };
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/board/engine/mindmap-layout.ts
git commit -m "feat(board): add mindmap layout module"
```

---

### Task 4: Integrate mindmap layout + cycle prevention in CanvasEngine

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts`
- Modify: `apps/web/src/components/board/engine/connectors.ts`

**Step 1: Pass draft color into connector element**

```ts
// apps/web/src/components/board/engine/connectors.ts
return {
  ...,
  style,
  color: draft.color,
};
```

**Step 2: Add layout direction state + autoLayoutMindmap**

```ts
// CanvasEngine.ts
private mindmapLayoutDirection: "right" | "left" | "balanced" = "right";

setMindmapLayoutDirection(direction: "right" | "left" | "balanced"): void {
  this.mindmapLayoutDirection = direction;
  this.autoLayoutMindmap();
}

autoLayoutMindmap(): void {
  if (this.locked) return;
  const { updates, ghostUpdates } = computeMindmapLayout(
    this.doc.getElements(),
    this.mindmapLayoutDirection
  );
  if (updates.length === 0 && ghostUpdates.length === 0) return;
  this.doc.transact(() => {
    updates.forEach(update => this.doc.updateElement(update.id, { xywh: update.xywh }));
    ghostUpdates.forEach(update => this.doc.updateElement(update.id, { xywh: update.xywh }));
  });
  this.commitHistory();
}
```

**Step 3: Add cycle detection + toast**

```ts
// CanvasEngine.ts
import { toast } from "sonner";

private wouldCreateCycle(sourceId: string, targetId: string): boolean {
  // Build adjacency from existing connectors and check if target reaches source.
  return false;
}
```

Use this in `addConnectorElement` and `updateConnectorEndpoint` when end is an elementId. If cycle, show toast and abort mutation.

**Step 4: Trigger autoLayoutMindmap on relevant mutations**
- After adding connector, updating connector endpoint, adding/deleting nodes, toggling collapse, or reparenting.

**Step 5: Commit**

```bash
git add apps/web/src/components/board/engine/CanvasEngine.ts \
  apps/web/src/components/board/engine/connectors.ts
git commit -m "feat(board): integrate mindmap layout + cycle prevention"
```

---

### Task 5: Text node UI (branch color + collapse/ghost)

**Files:**
- Modify: `apps/web/src/components/board/nodes/TextNode.tsx`

**Step 1: Apply branch color styling**
- Use `element.meta.branchColor` for border/text accent when not editing.

**Step 2: Render collapse control & ghost display**
- Show a collapse toggle button on the right side when node has children and is not multi-parent.
- For `meta.mindmapGhost`, render a compact pill that only shows `+N` and is not editable.

**Step 3: Commit**

```bash
git add apps/web/src/components/board/nodes/TextNode.tsx
git commit -m "feat(board): add mindmap branch color and collapse UI"
```

---

### Task 6: Keyboard creation + drag-to-parent (text nodes only)

**Files:**
- Modify: `apps/web/src/components/board/tools/SelectTool.ts`
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts`

**Step 1: Add engine helpers for mindmap operations**
- `createMindmapChild(parentId)`
- `createMindmapSibling(nodeId)`
- `promoteMindmapNode(nodeId)`
- `toggleMindmapCollapse(nodeId)`
- `reparentMindmapNode(nodeId, newParentId)`

**Step 2: Wire shortcuts in SelectTool**
- Tab/Enter/Shift+Tab/Backspace only when selected node is `text`.
- Ensure editing/inputs still ignore shortcut handling.

**Step 3: Drag-to-parent for text nodes**
- On pointer up, if dragged node is text and dropped on another node, call `reparentMindmapNode`.

**Step 4: Commit**

```bash
git add apps/web/src/components/board/tools/SelectTool.ts \
  apps/web/src/components/board/engine/CanvasEngine.ts
git commit -m "feat(board): mindmap shortcuts and reparenting"
```

---

### Task 7: Layout direction toggle in toolbar

**Files:**
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`

**Step 1: Add a simple layout direction toggle**
- Add a small button group (Right / Left / Balanced) that calls `engine.setMindmapLayoutDirection`.

**Step 2: Commit**

```bash
git add apps/web/src/components/board/toolbar/BoardToolbar.tsx
git commit -m "feat(board): add mindmap layout direction toggle"
```

---

Plan complete and saved to `docs/plans/2026-02-01-mindmap-global-layout-implementation-plan.md`.

Two execution options:
1) Subagent-Driven (this session) — I will execute the plan task-by-task here (no subagents available, but I’ll follow the same stepwise flow)
2) Parallel Session — Open a new session and use superpowers:executing-plans for batch execution

Which approach?
