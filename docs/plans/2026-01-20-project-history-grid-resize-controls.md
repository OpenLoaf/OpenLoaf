# Project History Grid Resize Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update ProjectHistory grid resizing to use calendar-driven minimum sizes, separate X/Y drag lines, remove the center plus, and match the main divider styling.

**Architecture:** Measure the calendar panel to derive minimum width/height. Replace the single cross handle with independent horizontal/vertical dividers styled like the main layout divider, and update drag logic to constrain each axis separately.

**Tech Stack:** React, TypeScript, Tailwind CSS.

> **Note:** Project rules require skipping TDD and worktrees for superpowers workflows. Tests are not added in this plan.

### Task 1: Inspect existing divider styling

**Files:**
- Reference: `apps/web/src/components/layout/TabLayout.tsx`
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Identify divider classes/behavior in TabLayout to mirror for the grid separators.

### Task 2: Measure calendar panel for min size

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Add a ref to the calendar panel container.
**Step 2:** Use ResizeObserver to capture its width/height.
**Step 3:** Use these measurements as min constraints for col/row ratios.

### Task 3: Split drag handles into X and Y separators

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Replace the center cross with two draggable separators (vertical and horizontal).
**Step 2:** Bind vertical separator to X resizing and horizontal separator to Y resizing.
**Step 3:** Keep pointer capture and clamping for each axis.

### Task 4: Apply divider styling and gap behavior

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Style the separators to match the TabLayout divider (width/hover/active states).
**Step 2:** Adjust grid gap or overlay separators so the visual spacing matches the main divider.

### Task 5: Sanity check

**Files:**
- Modify: `apps/web/src/components/project/ProjectHistory.tsx`

**Step 1:** Verify min size clamps match the calendar size.
**Step 2:** Verify X/Y dragging works independently and the center plus is removed.
