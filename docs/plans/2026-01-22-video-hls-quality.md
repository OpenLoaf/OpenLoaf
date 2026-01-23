# Video HLS Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add HLS multi-quality output (720p/1080p/source) with a player quality selector; default to 1080p.

**Architecture:** Extend the HLS manifest endpoint to emit a master playlist when no quality is specified, and generate per-quality variant playlists and segments into separate cache subfolders. The frontend Video viewer loads the master playlist and offers a quality switch that maps to HLS levels.

**Tech Stack:** Hono, fluent-ffmpeg, hls.js, React.

> Note: Per project rules, skip TDD tests and do not create a worktree for this task.

---

### Task 1: Extend HLS service for multi-quality playlists

**Files:**
- Modify: `apps/server/src/modules/media/hlsService.ts`

**Step 1: Add quality support types and cache layout**
- Define a `HlsQuality` union (`"720p" | "1080p" | "source"`).
- Add a helper to resolve per-quality cache dir: `<cacheKey>/<quality>`.

**Step 2: Generate variant playlists per quality**
- Update `ensureHlsAssets` to accept `quality` and build output options:
  - 1080p: `-vf scale=-2:1080`
  - 720p: `-vf scale=-2:720`
  - source: no scale filter
- Keep existing HLS options, output to `<cacheDir>/<quality>/index.m3u8` and `segment_%03d.ts`.

**Step 3: Build master playlist**
- When no `quality` query is provided, return a master playlist string:
  - `#EXTM3U`
  - `#EXT-X-STREAM-INF` entries for 1080p, 720p, source
  - Each URI should be `/media/hls/manifest?path=...&projectId=...&quality=...`
- Do not rewrite segment URLs for master playlists.

---

### Task 2: Update HLS routes to accept quality

**Files:**
- Modify: `apps/server/src/modules/media/hlsRoutes.ts`

**Step 1: Parse optional `quality` from query**
- Pass `quality` into `getHlsManifest`.
- Validate allowed values; return 400 on invalid value.

---

### Task 3: Add player quality selector

**Files:**
- Modify: `apps/web/src/components/file/VideoViewer.tsx`
- Modify: `apps/web/src/components/file/VideoPlayer.tsx`

**Step 1: Expose HLS instance from VideoPlayer**
- Add an optional `onHlsReady` callback to deliver the `Hls` instance.
- Ensure cleanup still calls `hls.destroy()`.

**Step 2: Render quality control in VideoViewer**
- Add a small overlay UI (top-right of video container): Auto, 1080P, 720P, 原画.
- Map to `hls.currentLevel`:
  - Auto: `-1`
  - 1080P: choose level with `height === 1080`
  - 720P: choose level with `height === 720`
  - 原画: choose the highest level where `height > 1080` or the one tagged as source (see Task 4 mapping)
- Default selected label to 1080P once levels available.

---

### Task 4: Align level metadata with labels

**Files:**
- Modify: `apps/server/src/modules/media/hlsService.ts`

**Step 1: Provide stable labels in master playlist**
- Add `RESOLUTION` and `NAME` tags to each `#EXT-X-STREAM-INF`:
  - 1080P: `RESOLUTION=1920x1080,NAME="1080P"`
  - 720P: `RESOLUTION=1280x720,NAME="720P"`
  - 原画: `NAME="原画"` and use actual source width/height if available (optional)

---

### Task 5: Manual verification

**Files:**
- None (runtime verification)

**Step 1: Generate master playlist**
- Request `/media/hls/manifest?path=...&projectId=...` and verify it returns a master playlist with 3 variants.

**Step 2: Video viewer UI**
- Open a video from file system preview.
- Verify quality selector toggles between Auto/1080P/720P/原画 and playback continues.

---

Plan complete and saved to `docs/plans/2026-01-22-video-hls-quality.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
