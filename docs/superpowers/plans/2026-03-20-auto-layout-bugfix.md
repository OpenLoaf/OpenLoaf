# Auto-Layout Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 confirmed bugs in the canvas auto-layout system (mindmap layout, spatial tidying, and selection layout).

**Architecture:** Pure logic fixes in 3 files — no new files, no API changes. Each fix is isolated and can be committed independently. All changes are in `apps/web/src/components/board/engine/`.

**Tech Stack:** TypeScript, canvas engine internals (CanvasEngine, auto-layout, mindmap-layout)

---

## File Map

| File | Responsibility | Tasks |
|------|---------------|-------|
| `apps/web/src/components/board/engine/CanvasEngine.ts` | Engine orchestration, mindmap operations | Task 1, 2, 6 |
| `apps/web/src/components/board/engine/mindmap-layout.ts` | Mindmap tree layout algorithm | Task 3 |
| `apps/web/src/components/board/engine/auto-layout.ts` | Spatial tidying, DAG layout, collision resolution | Task 4, 5, 7, 8, 9 |

---

### Task 1: Fix `autoLayoutMindmapPinned` — ghost nodes not offset

**Priority:** P0 (user-visible visual break)

**Problem:** `collectMindmapSubtree` traverses via `getMindmapOutboundConnectors` which explicitly excludes ghost nodes (line 2636). After `autoLayoutMindmap()` positions ghosts, the subsequent offset `(dx, dy)` skips them, leaving ghost nodes detached from their parent.

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts:1719-1744`

- [ ] **Step 1: Fix `autoLayoutMindmapPinned` to also offset ghost nodes and ghost connectors**

In `CanvasEngine.ts`, replace the `autoLayoutMindmapPinned` method (around line 1718-1744):

```typescript
  /** Auto layout mindmap, keeping a pinned node in its original position. */
  autoLayoutMindmapPinned(pinnedId: string): void {
    const before = this.doc.getElementById(pinnedId);
    if (!before || before.kind !== "node") {
      this.autoLayoutMindmap();
      return;
    }
    const [bx, by] = before.xywh;
    this.autoLayoutMindmap();
    const after = this.doc.getElementById(pinnedId);
    if (!after || after.kind !== "node") return;
    const [ax, ay] = after.xywh;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return;
    // 逻辑：将整棵树偏移回去，使 pinned 节点保持原位。
    const rootId = this.resolveMindmapRootId(pinnedId);
    const descendants = this.collectMindmapSubtree(rootId);
    // 收集属于这棵子树的 ghost 节点和 ghost 连接线
    const ghostNodeIds: string[] = [];
    const ghostConnectorIds: string[] = [];
    const descendantSet = new Set(descendants);
    this.doc.getElements().forEach(el => {
      if (el.kind === "node") {
        const parentId = this.getMindmapString(el, MINDMAP_META.ghostParentId);
        if (parentId && descendantSet.has(parentId)) {
          ghostNodeIds.push(el.id);
        }
      } else if (el.kind === "connector") {
        const parentId = this.getMindmapString(el, MINDMAP_META.ghostConnectorParentId);
        if (parentId && descendantSet.has(parentId)) {
          ghostConnectorIds.push(el.id);
        }
      }
    });
    this.doc.transact(() => {
      // 偏移真实节点
      descendants.forEach(id => {
        const el = this.doc.getElementById(id);
        if (!el || el.kind !== "node") return;
        const [ex, ey, ew, eh] = el.xywh;
        this.doc.updateElement(id, { xywh: [ex + dx, ey + dy, ew, eh] });
      });
      // 偏移 ghost 节点
      ghostNodeIds.forEach(id => {
        const el = this.doc.getElementById(id);
        if (!el || el.kind !== "node") return;
        const [ex, ey, ew, eh] = el.xywh;
        this.doc.updateElement(id, { xywh: [ex + dx, ey + dy, ew, eh] });
      });
      // 偏移 ghost 连接线（point 端点需要手动偏移）
      ghostConnectorIds.forEach(id => {
        const el = this.doc.getElementById(id);
        if (!el || el.kind !== "connector") return;
        const [ex, ey, ew, eh] = el.xywh;
        const patch: Record<string, unknown> = {
          xywh: [ex + dx, ey + dy, ew, eh],
        };
        // 偏移 source/target 的 point 端点
        if ("point" in el.source) {
          const [sx, sy] = el.source.point;
          patch.source = { point: [sx + dx, sy + dy] };
        }
        if ("point" in el.target) {
          const [tx, ty] = el.target.point;
          patch.target = { point: [tx + dx, ty + dy] };
        }
        this.doc.updateElement(id, patch);
      });
    });
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/CanvasEngine.ts
git commit -m "fix(board): offset ghost nodes and connectors in autoLayoutMindmapPinned"
```

---

### Task 2: Fix `autoLayoutMindmapPinned` — missing `commitHistory` and double commit

**Priority:** P0 (undo behavior broken)

**Problem:** (a) The final transact in `autoLayoutMindmapPinned` has no `commitHistory()`, so the offset is lost on undo. (b) Callers like `createMindmapChild` call `commitHistory()` before `autoLayoutMindmapPinned`, and `autoLayoutMindmap` inside calls it again — two snapshots for one action.

**Fix strategy:** Remove the `commitHistory()` from inside `autoLayoutMindmap` when called from `autoLayoutMindmapPinned`, and add one at the end of `autoLayoutMindmapPinned`. To do this cleanly, add an optional `skipHistory` parameter to `autoLayoutMindmap`.

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts:1502-1716` (autoLayoutMindmap) and `1718-end of autoLayoutMindmapPinned`

- [ ] **Step 1: Add `skipHistory` param to `autoLayoutMindmap`**

In `CanvasEngine.ts`, modify the `autoLayoutMindmap` signature and the `commitHistory` call at the end:

Change line ~1502:
```typescript
  /** Auto layout all nodes using the mindmap tree. */
  autoLayoutMindmap(options?: { skipHistory?: boolean }): void {
```

Change line ~1713-1715:
```typescript
    if (hasChanges && !options?.skipHistory) {
      this.commitHistory();
    }
```

- [ ] **Step 2: Update `autoLayoutMindmapPinned` to use `skipHistory` and commit at end**

In the `autoLayoutMindmapPinned` method (after Task 1's changes), change the `autoLayoutMindmap()` call and add `commitHistory()` at the end:

```typescript
  autoLayoutMindmapPinned(pinnedId: string): void {
    const before = this.doc.getElementById(pinnedId);
    if (!before || before.kind !== "node") {
      this.autoLayoutMindmap();
      return;
    }
    const [bx, by] = before.xywh;
    this.autoLayoutMindmap({ skipHistory: true });  // <-- skipHistory
    const after = this.doc.getElementById(pinnedId);
    if (!after || after.kind !== "node") {
      this.commitHistory();  // <-- layout happened but no offset needed
      return;
    }
    // ... (rest of offset logic) ...
    this.doc.transact(() => {
      // ... (offset code from Task 1) ...
    });
    this.commitHistory();  // <-- single commit covers layout + offset
  }
```

Also update callers `createMindmapChild` and `createMindmapSibling` — remove the `this.commitHistory()` call that happens right before `autoLayoutMindmapPinned`, since the pinned method now handles its own commit:

In `createMindmapChild` (~line 1825): remove `this.commitHistory();` before `this.autoLayoutMindmapPinned(parentId);`

In `createMindmapSibling` (~line 1860): remove `this.commitHistory();` before `this.autoLayoutMindmapPinned(nodeId);`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/engine/CanvasEngine.ts
git commit -m "fix(board): unify commitHistory in autoLayoutMindmapPinned for correct undo"
```

---

### Task 3: Fix `layoutTree` — single child Y over-offset

**Priority:** P0 (visual misalignment)

**Problem:** In `mindmap-layout.ts:338-343`, when root is tall and has 1 child, `cursorY` gets a double vertical centering adjustment. First: `cursorY = rootY + (rootH - boundH)/2`. Then: `cursorY += (rootH - childH)/2`. Then at line 348: `childY = cursorY + (boundH - childH)/2`. With rootH=200, childH=40: child ends at rootY+160 instead of rootY+80.

**Files:**
- Modify: `apps/web/src/components/board/engine/mindmap-layout.ts:338-343`

- [ ] **Step 1: Remove the redundant single-child centering block**

In `mindmap-layout.ts`, delete lines 340-343:

```typescript
    // DELETE these 4 lines:
    if (rootH >= tree.boundH && tree.children.length === 1) {
      const onlyChild = tree.children[0];
      cursorY += (rootH - onlyChild.height) / 2;
    }
```

The existing logic at line 338 (`cursorY = rootY + (rootH - tree.boundH) / 2`) plus line 348 (`childY = cursorY + (child.boundH - child.height) / 2`) already correctly centers the child vertically within the root.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/mindmap-layout.ts
git commit -m "fix(board): remove redundant single-child Y centering in mindmap layout"
```

---

### Task 4: Fix `tidyRow` / `tidyColumn` — locked node recentering bug

**Priority:** P1 (triggers only when locked nodes exist in tidy layout)

**Problem:** `origCx` sums all items but `newCx` skips locked items (no `pos`), yet both divide by `items.length`. Same issue in `tidyColumn`.

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts:625-784`

- [ ] **Step 1: Fix `tidyRow` recentering**

In `auto-layout.ts`, fix the recentering logic in `tidyRow` (around line 665-703). Replace the origCx and newCx computation to only count non-locked items:

Replace lines ~665-703:
```typescript
  // Original centroid (non-locked only)
  let origCx = 0
  let origCount = 0
  items.forEach((item) => {
    if (item.node.locked) return
    origCx += item.node.xywh[0] + item.node.xywh[2] / 2
    origCount += 1
  })
  if (origCount > 0) origCx /= origCount

  // First node X stays, subsequent nodes placed with uniform gap
  let cursorX = items[0].node.xywh[0]
  items.forEach((item) => {
    if (item.node.locked) {
      cursorX = item.node.xywh[0] + item.node.xywh[2] + gap
      return
    }
    const [, , w, h] = item.node.xywh
    let y: number
    if (vAlign === "top") y = alignY
    else if (vAlign === "bottom") y = alignY - h
    else y = alignY - h / 2
    layoutPositions.set(item.id, [cursorX, y])
    cursorX = cursorX + w + gap
  })

  // Re-center to original centroid X (non-locked only)
  if (origCount > 0) {
    let newCx = 0
    let newCount = 0
    items.forEach((item) => {
      const pos = layoutPositions.get(item.id)
      if (!pos) return
      newCx += pos[0] + item.node.xywh[2] / 2
      newCount += 1
    })
    if (newCount > 0) {
      newCx /= newCount
      const dx = origCx - newCx
      if (Math.abs(dx) > 0.5) {
        items.forEach((item) => {
          const pos = layoutPositions.get(item.id)
          if (!pos) return
          layoutPositions.set(item.id, [pos[0] + dx, pos[1]])
        })
      }
    }
  }
```

- [ ] **Step 2: Fix `tidyColumn` recentering**

Same pattern — replace the origCy and newCy computation in `tidyColumn` (around line 745-783):

Replace lines ~745-783:
```typescript
  // Original centroid (non-locked only)
  let origCy = 0
  let origCount = 0
  items.forEach((item) => {
    if (item.node.locked) return
    origCy += item.node.xywh[1] + item.node.xywh[3] / 2
    origCount += 1
  })
  if (origCount > 0) origCy /= origCount

  // Place with detected alignment
  let cursorY = items[0].node.xywh[1]
  items.forEach((item) => {
    if (item.node.locked) {
      cursorY = item.node.xywh[1] + item.node.xywh[3] + gap
      return
    }
    const [, , w, h] = item.node.xywh
    let x: number
    if (hAlign === "left") x = alignX
    else if (hAlign === "right") x = alignX - w
    else x = alignX - w / 2
    layoutPositions.set(item.id, [x, cursorY])
    cursorY += h + gap
  })

  // Re-center to original centroid Y (non-locked only)
  if (origCount > 0) {
    let newCy = 0
    let newCount = 0
    items.forEach((item) => {
      const pos = layoutPositions.get(item.id)
      if (!pos) return
      newCy += pos[1] + item.node.xywh[3] / 2
      newCount += 1
    })
    if (newCount > 0) {
      newCy /= newCount
      const dy = origCy - newCy
      if (Math.abs(dy) > 0.5) {
        items.forEach((item) => {
          const pos = layoutPositions.get(item.id)
          if (!pos) return
          layoutPositions.set(item.id, [pos[0], pos[1] + dy])
        })
      }
    }
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/engine/auto-layout.ts
git commit -m "fix(board): use consistent node set for recentering in tidyRow/tidyColumn"
```

---

### Task 5: Fix `tidyGrid` — inconsistent centroid computation with locked nodes

**Priority:** P1

**Problem:** `origCx/origCy` uses `count` (all nodes) as divisor, `newCx/newCy` uses `newCount` (only nodes with pos). And the numerator sets differ too.

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts:550-622`

- [ ] **Step 1: Fix `tidyGrid` recentering to exclude locked nodes from both orig and new**

Replace lines ~550-622 (the recentering section at the end of `tidyGrid`):

```typescript
  // Compute original cluster centroid (non-locked only)
  let origCxSum = 0
  let origCySum = 0
  let origCount = 0
  rows.forEach((row) => {
    row.forEach((id) => {
      const node = layoutNodes.get(id)
      if (!node || node.locked) return
      origCxSum += node.xywh[0] + node.xywh[2] / 2
      origCySum += node.xywh[1] + node.xywh[3] / 2
      origCount += 1
    })
  })

  // Place nodes with detected alignment
  rows.forEach((row, rowIdx) => {
    row.forEach((id, colIdx) => {
      const node = layoutNodes.get(id)
      if (!node || node.locked) return
      const [, , w, h] = node.xywh
      const cx = finalColX[colIdx]
      const cy = finalRowY[rowIdx]

      // Horizontal alignment within column slot
      let x: number
      const hAlign = colHAligns[colIdx]
      if (hAlign === "left") x = cx - colWidths[colIdx] / 2
      else if (hAlign === "right") x = cx + colWidths[colIdx] / 2 - w
      else x = cx - w / 2

      // Vertical alignment within row slot
      let y: number
      const vAlign = rowVAligns[rowIdx]
      if (vAlign === "top") y = cy - rowHeights[rowIdx] / 2
      else if (vAlign === "bottom") y = cy + rowHeights[rowIdx] / 2 - h
      else y = cy - h / 2

      layoutPositions.set(id, [x, y])
    })
  })

  // Re-center to original cluster centroid (non-locked only)
  if (origCount > 0) {
    let newCxSum = 0
    let newCySum = 0
    let newCount = 0
    rows.forEach((row) => {
      row.forEach((id) => {
        const node = layoutNodes.get(id)
        if (!node) return
        const pos = layoutPositions.get(id)
        if (!pos) return
        newCxSum += pos[0] + node.xywh[2] / 2
        newCySum += pos[1] + node.xywh[3] / 2
        newCount += 1
      })
    })
    if (newCount > 0) {
      const newCx = newCxSum / newCount
      const newCy = newCySum / newCount
      const origCx = origCxSum / origCount
      const origCy = origCySum / origCount
      const dx = origCx - newCx
      const dy = origCy - newCy
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        rows.forEach((row) => {
          row.forEach((id) => {
            const pos = layoutPositions.get(id)
            if (!pos) return
            layoutPositions.set(id, [pos[0] + dx, pos[1] + dy])
          })
        })
      }
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/auto-layout.ts
git commit -m "fix(board): consistent centroid computation in tidyGrid with locked nodes"
```

---

### Task 6: Fix `collectMindmapSubtree` — O(n^2) performance

**Priority:** P2

**Problem:** `result.includes(childId)` is O(n) per call, making BFS O(n^2). Also `queue.shift()` is O(n).

**Files:**
- Modify: `apps/web/src/components/board/engine/CanvasEngine.ts:1747-1762`

- [ ] **Step 1: Replace Array.includes with Set**

Replace the `collectMindmapSubtree` method:

```typescript
  /** Collect all node ids in a mindmap subtree rooted at nodeId. */
  private collectMindmapSubtree(rootId: string): string[] {
    const visited = new Set<string>([rootId]);
    const queue = [rootId];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const outbound = this.getMindmapOutboundConnectors(current);
      outbound.forEach(connector => {
        if (!("elementId" in connector.target)) return;
        const childId = connector.target.elementId;
        if (visited.has(childId)) return;
        visited.add(childId);
        queue.push(childId);
      });
    }
    return queue;
  }
```

Uses `head` pointer instead of `shift()` (O(1) dequeue) and `Set` for O(1) lookup.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/CanvasEngine.ts
git commit -m "perf(board): use Set for O(1) lookup in collectMindmapSubtree"
```

---

### Task 7: Fix `isExcludedNode` — global layout should skip mindmap tree nodes

**Priority:** P1

**Problem:** `autoLayoutBoard` processes mindmap real nodes (non-ghost, non-hidden), which can destroy carefully arranged mindmap trees. Only ghost/hidden are excluded, but regular mindmap nodes with tree connectors should also be excluded.

**Fix strategy:** Rather than checking mindmap meta on each node (which would require knowing if a node is part of a mindmap tree), check if the node has any mindmap-flagged connectors. A simpler approach: check if the node has a `mindmapLayoutDirection` meta or any inbound connectors from mindmap parents. However, the simplest correct approach is to add `mindmapMember` check — nodes that are part of a mindmap tree (have inbound/outbound connectors with other mindmap nodes) should be excluded.

Actually, the cleanest fix: exclude nodes that have `treeParentMap` entries or are roots with children in the mindmap context. But `isExcludedNode` only sees the node, not the graph. Instead, pass the linked mindmap node IDs to the filter.

Simplest approach: in `buildLayoutGraph`, after building connectors, detect nodes that are part of a mindmap tree (they have mindmap-related meta like `mindmapCollapsed`, `mindmapChildCount`, or `mindmapBranchColor`) and exclude them.

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts:139-145`

- [ ] **Step 1: Add mindmap node detection to `isExcludedNode`**

```typescript
function isExcludedNode(node: CanvasNodeElement): boolean {
  if (node.type === STROKE_NODE_TYPE) return true
  const meta = node.meta as Record<string, unknown> | undefined
  if (meta?.mindmapGhost) return true
  if (meta?.mindmapHidden) return true
  // 逻辑：排除思维导图树中的节点，避免全局布局破坏树形结构。
  if (meta?.mindmapBranchColor !== undefined) return true
  return false
}
```

`mindmapBranchColor` is set by `computeMindmapLayout` on ALL nodes that are part of a mindmap tree (both roots and children, line 212-247 in mindmap-layout.ts). This is the most reliable indicator.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/auto-layout.ts
git commit -m "fix(board): exclude mindmap tree nodes from global auto-layout"
```

---

### Task 8: Fix `computePartialLayoutUpdates` — filter locked nodes from updates

**Priority:** P2

**Problem:** Locked nodes from `layoutDAGConservative` get their original position written to `layoutPositions`, then `snapToGrid` may shift them.

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts:1675-1683`

- [ ] **Step 1: Add locked check in linked nodes output**

In `computePartialLayoutUpdates`, around line 1675, add a locked check:

```typescript
    linkedNodes.forEach((node) => {
      if (node.locked) return  // <-- add this line
      const pos = layoutPositions.get(node.id)
      if (!pos) return
      const [, , w, h] = node.xywh
      allUpdates.push({
        id: node.id,
        xywh: [snapToGrid(pos[0]), snapToGrid(pos[1]), w, h],
      })
    })
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/auto-layout.ts
git commit -m "fix(board): skip locked nodes in partial layout update output"
```

---

### Task 9: Clean up `resolveOverlapsMinimal` — remove dead code

**Priority:** P2

**Problem:** 4 computed-but-never-used variables (`pushRight`, `pushLeft`, `pushDown`, `pushUp`) at line 853-856.

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts:853-856`

- [ ] **Step 1: Remove the 4 unused variable declarations**

Delete these 4 lines from `resolveOverlapsMinimal`:

```typescript
        const pushRight = (a.x + a.w + MIN_GAP) - b.x
        const pushLeft = b.x + b.w + MIN_GAP - a.x
        const pushDown = (a.y + a.h + MIN_GAP) - b.y
        const pushUp = b.y + b.h + MIN_GAP - a.y
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/engine/auto-layout.ts
git commit -m "refactor(board): remove unused variables in resolveOverlapsMinimal"
```
