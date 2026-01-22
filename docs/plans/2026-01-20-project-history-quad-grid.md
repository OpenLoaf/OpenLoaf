# Project History Quad Grid Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert ProjectHistory into a 2x2 resizable grid with a draggable center cross and persist the split ratios in localStorage.

**Architecture:** Use CSS Grid with inline `gridTemplateColumns/Rows` derived from state. A draggable center handle updates the ratios via pointer events and saves to localStorage.

**Tech Stack:** React, TypeScript, Tailwind CSS.

> **Note:** Project rules require skipping TDD and worktrees for superpowers workflows. Tests are not added in this plan.

### Task 1: Read current ProjectHistory layout

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Review the current layout and identify the sections to place in a 2x2 grid.

### Task 2: Add grid state + localStorage persistence

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Add localStorage key and default grid ratios.
**Step 2:** Load persisted ratios on mount with validation/clamping.
**Step 3:** Save ratios on change.

### Task 3: Implement draggable center cross

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Add a container ref for measuring bounds.
**Step 2:** Add pointer event handlers that compute `colRatio` and `rowRatio`.
**Step 3:** Clamp ratios to a safe min/max and update state.

### Task 4: Convert layout to 2x2 grid

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Replace current two-row layout with a 2x2 grid.
**Step 2:** Place panels: 左上=日历, 右上=历史列表, 左下=当日文件变化, 右下=当日总结.
**Step 3:** Add the draggable cross overlay at the grid intersection.

### Task 5: Sanity check

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Ensure drag handles work and layout updates.
**Step 2:** Confirm ratios persist after reload.
