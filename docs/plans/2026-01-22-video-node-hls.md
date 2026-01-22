# Video Node + HLS Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use @superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a project-file-backed Video node that plays local videos via HLS, plus a Video viewer and desktop widget.

**Architecture:** Frontend stores only project-relative video paths and renders playback via a shared VideoPlayer component using `hls.js`. Backend provides HLS manifests/segments on-demand via Hono and caches ffmpeg outputs under `.tenas-cache`.

**Tech Stack:** Next.js (React), `hls.js`, Hono (Node), ffmpeg (system), `execa` (process).

> Note: Project rules require skipping TDD and avoiding worktrees when running superpowers skills. This plan omits test steps and assumes changes are made in the current branch.

### Task 1: Add shared video preview types and routing

**Files:**
- Modify: `apps/web/src/components/file/lib/file-preview-types.ts`
- Modify: `apps/web/src/components/file/FilePreviewDialog.tsx`
- Modify: `apps/web/src/components/file/lib/open-file.ts`
- Modify: `apps/web/src/components/project/filesystem/components/FileSystemEntryVisual.tsx`

**Step 1: Extend preview viewer types**
- Add `"video"` to `FilePreviewViewer`.
- Update viewer resolution in `open-file.ts` to map `VIDEO_EXTS` to `"video"`.

**Step 2: Wire FilePreviewDialog to VideoViewer**
- Import and render `VideoViewer` when `payload.viewer === "video"`.

**Step 3: Confirm video extensions**
- Ensure `VIDEO_EXTS` includes `mp4/mov/mkv/webm/avi` and is reused for filtering.

### Task 2: Implement shared VideoPlayer and VideoViewer

**Files:**
- Create: `apps/web/src/components/file/VideoPlayer.tsx`
- Create: `apps/web/src/components/file/VideoViewer.tsx`
- Modify: `apps/web/package.json`

**Step 1: Add `hls.js` dependency**
- Add `hls.js` to web app dependencies.

**Step 2: Build VideoPlayer**
- Implement a `<video>` wrapper that:
  - Detects native HLS support (Safari) and uses direct `src`.
  - Otherwise instantiates `Hls`, attaches media, loads manifest URL.
  - Exposes minimal props: `src`, `poster`, `autoPlay`, `controls`, `onError`.
- Add English method/prop comments; add Chinese logic comments where needed.

**Step 3: Build VideoViewer**
- Accept `uri/projectId/rootUri` and compute HLS manifest URL.
- Render VideoPlayer with proper sizing and header (match other viewers).

### Task 3: Add VideoNode + Detail panel

**Files:**
- Create: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Create: `apps/web/src/components/board/nodes/VideoNodeDetail.tsx`
- Modify: `apps/web/src/components/board/core/board-nodes.ts`

**Step 1: Define VideoNode props/schema**
- `sourcePath: string`
- `fileName?: string`
- Optional cached metadata: `duration?`, `naturalWidth?`, `naturalHeight?`, `posterPath?`

**Step 2: Implement VideoNode view**
- Render poster/placeholder with play badge and filename.
- Double-click opens preview (use existing `openFilePreview` flow).
- Support selection and lock behavior similar to ImageNode.

**Step 3: Implement VideoNodeDetail**
- Show path, file name, optional metadata.
- Add desktop-only “open file” action if available.

**Step 4: Register node definition**
- Add `VideoNodeDefinition` to `BOARD_NODE_DEFINITIONS`.

### Task 4: Add project video picker in toolbar

**Files:**
- Modify: `apps/web/src/components/board/toolbar/BoardToolbar.tsx`
- Create: `apps/web/src/components/project/filesystem/components/ProjectFilePickerDialog.tsx`
- Modify: `apps/web/src/components/project/filesystem/models/file-system-model.ts`

**Step 1: Create ProjectFilePickerDialog**
- Reuse existing file system model/state to show project tree + file list.
- Filter selectable entries to `VIDEO_EXTS`.
- Return selected file entry (uri + name).

**Step 2: Add “Video” toolbar item**
- Add insert item with play icon.
- On click, open picker dialog (not OS file picker).

**Step 3: Insert VideoNode from selection**
- Build node props from selected entry (`sourcePath`, `fileName`).
- Set default size (e.g., 360x240) or use metadata if available.

### Task 5: Implement HLS routes in server

**Files:**
- Create: `apps/server/src/modules/media/hlsRoutes.ts`
- Create: `apps/server/src/modules/media/hlsService.ts`
- Modify: `apps/server/src/bootstrap/createApp.ts`

**Step 1: Add HLS service**
- Resolve project root via `getProjectRootPath`/`resolveFilePathFromUri`.
- Validate `path` stays within project root.
- Compute cache dir: `<projectRoot>/.tenas-cache/hls/<hash>`.
- Run ffmpeg via `execa` to create `index.m3u8` and segments.

**Step 2: Add Hono routes**
- `GET /media/hls/manifest?path=...&projectId=...` returns m3u8.
- `GET /media/hls/segment/:name?token=...` returns segment bytes.
- Ensure content-type headers for `application/vnd.apple.mpegurl` and `video/MP2T`.

**Step 3: Register routes**
- Hook `registerHlsRoutes(app)` in `createApp`.

### Task 6: Add desktop VideoWidget

**Files:**
- Create: `apps/web/src/components/desktop/widgets/VideoWidget.tsx`
- Modify: `apps/web/src/components/desktop/widgets/index.ts` (if exists)

**Step 1: Implement widget UI**
- Minimal widget showing a “Play Video” button and optional last-used file.
- Use `VideoViewer` or `openFilePreview` when clicked.

### Task 7: Manual verification

**Steps:**
- Run `pnpm dev:web` and `pnpm dev:server`.
- Insert Video node from toolbar → select a video → ensure node appears.
- Double-click node → VideoViewer opens and HLS playback starts.
- Confirm non-video files are blocked by picker.

