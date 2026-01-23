# Vidstack Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current web video player with Vidstack React components and official UI.

**Architecture:** Introduce a shared `video-player` UI component that wraps Vidstack’s `MediaPlayer` + official layout, then update `VideoViewer` to consume it. Remove or bypass the current hls.js-driven player logic so Vidstack owns playback and quality UI.

**Tech Stack:** React, @vidstack/react, Vidstack official UI, HLS master playlist backend.

> Note: Per project rules, skip TDD tests and do not create a worktree for this task.

---

### Task 1: Add Vidstack UI component

**Files:**
- Create: `apps/web/src/components/ui/video-player.tsx`

**Step 1: Implement Vidstack player wrapper**
- Use `MediaPlayer`, `MediaProvider`, and the official layout component.
- Accept props: `src`, `poster`, `autoplay`, `muted`, `controls`, `className`.
- Import Vidstack CSS (where required by the official UI).

---

### Task 2: Wire VideoViewer to use Vidstack

**Files:**
- Modify: `apps/web/src/components/file/VideoViewer.tsx`
- (Optional) Deprecate: `apps/web/src/components/file/VideoPlayer.tsx`

**Step 1: Replace VideoPlayer usage**
- Import the new `video-player` UI component and pass the HLS master manifest URL.
- Remove hls.js-specific state and quality UI from `VideoViewer`.

---

### Task 3: Manual verification

**Files:**
- None (runtime verification)

**Step 1: Playback**
- Open a video from the file system and verify it plays.

**Step 2: Quality UI**
- Open the Vidstack settings menu and confirm 1080p/720p/原画 appear.

---

Plan complete and saved to `docs/plans/2026-01-22-vidstack-player.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
