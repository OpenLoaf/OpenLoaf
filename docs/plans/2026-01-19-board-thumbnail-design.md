# Board Thumbnail Capture Design

## Goal
Capture a low-resolution (320x200) board thumbnail as `index.png` when a board is closed and 30 seconds after the auto-layout button is clicked, and surface that thumbnail in the file system UI.

## Architecture
The board UI will reuse the existing HTML export pipeline (html-to-image) to capture the board DOM, filter out UI overlays, and then downscale the blob to a fixed 320x200 PNG. The capture is initiated inside `BoardCanvas` (on unmount and via an auto-layout callback) and saved to the board folder via `trpc.fs.writeBinary`. The file system thumbnail query will be extended to detect board folders and, when present, use `index.png` as the thumbnail for the folder entry.

## Key Changes
- Add a shared board export helper to encapsulate html-to-image settings, overlay filtering, and export-mode toggling.
- Add low-res thumbnail generation (cover scale) and persist to `boardFolderUri/index.png` on close and after auto layout.
- Extend `fs.folderThumbnails` to return board folder thumbnails based on `index.png`.
- Update the entry visual logic to show thumbnails for board folders when available.

## Data Flow
1. `BoardControls` fires an `onAutoLayout` callback after calling `engine.autoLayoutBoard()`.
2. `BoardCanvas` schedules a 30s timeout and calls `saveBoardThumbnail()`.
3. `saveBoardThumbnail()`:
   - toggles board export mode via `tenas:board-export` (hide grid)
   - captures DOM with html-to-image and filters overlays
   - resizes to 320x200 using an offscreen canvas
   - writes base64 PNG to `boardFolderUri/index.png` via `trpc.fs.writeBinary`
4. `fs.folderThumbnails` resolves `index.png` for board folders and returns a dataUrl keyed by folder URI.
5. File system UI reads the thumbnail map and displays the board thumbnail for the folder entry.

## Error Handling
- Capture and save failures are logged with `console.warn` without blocking the UI.
- Missing DOM or workspace/board scope short-circuits the capture.

## Testing Notes
Per project rules, TDD steps are skipped. Manual verification: open a board, click auto layout, wait 30s, then close; confirm `index.png` is created and the file system shows the thumbnail.
