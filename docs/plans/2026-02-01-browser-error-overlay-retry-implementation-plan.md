# Browser Error Overlay Retry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a visible error overlay with a retry button when embedded browser pages fail or the app is offline.

**Architecture:** Add offline detection and error visibility state in the browser panel, hide WebContentsView while in error, and extend the error overlay component to render offline/failure messaging plus a retry action that bumps the panel refresh key.

**Tech Stack:** React (Next.js), Electron WebContentsView, Tailwind UI components.

---

## Notes
- Per project rules, do NOT create a worktree and skip TDD test execution.
- Retry uses the existing panel refresh (`__refreshKey`) to remount the browser panel.

### Task 1: Track offline/error visibility in the browser panel

**Files:**
- Modify: `apps/web/src/components/browser/ElectrronBrowserWindow.tsx`

**Step 1: Add offline state tracking**
- Initialize `isOffline` from `navigator.onLine`.
- Add `online/offline` event listeners to update the state.

**Step 2: Compute error-visible state**
- `errorVisible = failed || (isOffline && targetUrl && !ready)`
- Mirror the value into a ref for the WebContentsView visibility loop.

**Step 3: Hide WebContentsView when error is visible**
- Extend the `visible` calculation in `upsertWebContentsView` sync loop with `!errorVisibleRef.current`.

**Step 4: Suppress progress/loading overlays when error is visible**
- Use `showLoadingOverlay = loading && !errorVisible`.
- Use `showProgress = loading && !errorVisible && targetUrl`.

### Task 2: Extend error overlay UI with retry

**Files:**
- Modify: `apps/web/src/components/browser/BrowserErrorOverlay.tsx`

**Step 1: Add props for offline/URL/retry**
- Props: `isOffline`, `url`, `onRetry`.
- Choose title/description based on offline vs failed.

**Step 2: Render retry button**
- Use `@tenas-ai/ui/button`.
- Hook to the browser panel retry handler.

### Task 3: Wire retry action

**Files:**
- Modify: `apps/web/src/components/browser/ElectrronBrowserWindow.tsx`

**Step 1: Create retry handler**
- Reuse the existing `onRefreshPanel` function.
- Pass it into `BrowserErrorOverlay` as `onRetry`.

---

## Manual verification (skip automated tests per project rule)
- Open a URL with no network and confirm the error overlay is visible.
- Click the retry button and verify the panel remounts.
- Restore network and confirm the page loads and overlay disappears.

