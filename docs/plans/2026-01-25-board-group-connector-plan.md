# Board Group Connector Behavior Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When grouping nodes, optionally merge external connectors to the group and show group anchors while hiding child anchors; when ungrouping, expand group connectors to all children.

**Architecture:** Implement connector merging/splitting in selection actions so document data matches expected behavior. Update anchor overlay filtering and group node connectable settings to control anchor visibility.

**Tech Stack:** React/TypeScript, board engine (CanvasEngine, selection-actions), Tailwind classes.

> Note: Project rule says skip TDD and do not create a worktree. Tests are optional and not required unless explicitly requested.

### Task 1: Update grouping connector behavior

**Files:**
- Modify: `apps/web/src/components/board/engine/selection-actions.ts`

**Step 1: Implement connector merge on group**
- Add logic after group creation to:
  - Collect connectors where one end is a child node and the other end is an external node.
  - If external node set size is 1, merge connectors so only one remains connected to the group and delete the rest.
  - If external node set size > 1, do nothing.

**Step 2: Implement connector split on ungroup**
- Add logic after group deletion to:
  - Find connectors that attach to the group.
  - For each connector, create a copy per child node (preserve direction), then delete the original connector.

**Step 3: Optional verification**
- Manual: group nodes with external connections and confirm merge/split behavior.

### Task 2: Enable group anchors and hide child anchors

**Files:**
- Modify: `apps/web/src/components/board/nodes/GroupNode.tsx`
- Modify: `apps/web/src/components/board/engine/anchorTypes.ts`
- Modify: `apps/web/src/components/board/core/AnchorOverlay.tsx`

**Step 1: Make group nodes connectable**
- Set group capabilities to `connectable: "anchors"`.

**Step 2: Show anchors for group nodes**
- Add `group` and `image-group` to `LARGE_ANCHOR_NODE_TYPES`.

**Step 3: Hide child anchors when grouped**
- In anchor overlay helpers, skip rendering anchors for nodes with `meta.groupId`.

**Step 4: Optional verification**
- Hover a group node to see anchors.
- Hover/select child nodes inside a group and confirm anchors are hidden.
