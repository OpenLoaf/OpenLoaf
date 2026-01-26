# Enable Group Anchors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable group nodes to show anchors and hide anchors for grouped child nodes.

**Architecture:** Reuse existing large-anchor rendering in AnchorOverlay by adding group node types to the large-anchor list, and skip rendering anchors for grouped child nodes by checking `meta.groupId` on node elements.

**Tech Stack:** React, TypeScript, Next.js board components

### Task 1: Enable group nodes to expose anchors

**Files:**
- Modify: `apps/web/src/components/board/nodes/GroupNode.tsx`

**Step 1: Update group node capabilities**

Set `connectable` to `"anchors"` so group nodes are treated as connectable by the engine.

### Task 2: Treat group nodes as large-anchor nodes

**Files:**
- Modify: `apps/web/src/components/board/engine/anchorTypes.ts`

**Step 1: Add group node types to LARGE_ANCHOR_NODE_TYPES**

Add `"group"` and `"image-group"` to the set so group nodes use the large-anchor overlay.

### Task 3: Hide anchors for grouped child nodes

**Files:**
- Modify: `apps/web/src/components/board/core/AnchorOverlay.tsx`

**Step 1: Add grouped-node guard in anchor collectors**

In `getSelectedImageAnchors` and `getHoveredImageAnchors`, skip nodes whose `meta.groupId` exists to avoid rendering anchors for grouped children.

### Task 4: Optional verification

**Step 1: Manual hover/selection checks**

- Hover a group node and confirm anchors show.
- Hover/select a child node inside a group and confirm anchors are hidden.
