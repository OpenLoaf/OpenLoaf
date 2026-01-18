# Auto Layout Overlap Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix auto-layout overlaps by recognizing group membership from props and adding lightweight collision resolution against unlinked/locked nodes.

**Architecture:** Extend the auto-layout module to build group membership from both meta.groupId and group props.childIds, then run a secondary-axis collision pass that minimally shifts linked nodes to avoid obstacles while keeping primary-axis position stable.

**Tech Stack:** TypeScript, React (board engine), Yjs-backed document model

## Notes
- Per project rules, skip TDD and do not create a worktree.

### Task 1: Group membership resolution

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts`

**Step 1: Update group membership mapping**
- Add a childId -> groupId map based on group node props.childIds.
- Merge into groupMembersMap alongside meta.groupId discovery.

**Step 2: Update layout id resolution**
- Use the childId -> groupId map as a fallback when meta.groupId is missing.

### Task 2: Lightweight collision resolution

**Files:**
- Modify: `apps/web/src/components/board/engine/auto-layout.ts`

**Step 1: Collect obstacle spans**
- Build obstacle rectangles from unlinked nodes and locked nodes.

**Step 2: Resolve secondary-axis overlaps**
- For each linked, unlocked node, minimally adjust its secondary-axis position to avoid obstacle spans that overlap on the primary axis.

### Task 3: Manual verification

**Files:**
- Review: `/Users/zhao/Documents/01.Code/Hex/Tenas/apps/server/workspace/project/tnboard_新建画布/index.tnboard`

**Step 1: Run auto layout**
- Confirm linked nodes no longer overlap unlinked nodes.
- Confirm group nodes move with their children when meta.groupId is absent.
