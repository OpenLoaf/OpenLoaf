# Electron file transfer UI (filesystem drag/drop)

## Goals

- In Electron, replace large file drag upload with local copy (no base64).
- Add a minimal progress UI in the file system panel.
- Support folder copy with the same progress UI.
- Provide simple retry for failed transfers.

## Non-goals

- Web browser uploads (kept as-is).
- Rich queue UI or history list.
- Parallel copy or bandwidth throttling.

## Approach options

- **A: Electron IPC copy (recommended)**
  - Renderer submits a transfer job to main process.
  - Main process copies files/folders and sends progress events.
  - Renderer renders a minimal progress bar.
- **B: Renderer queue + server calls**
  - Renderer walks folders and calls `writeBinary` / `importLocalFile`.
  - Progress is file-level, no byte-level for large files.
  - More fragile with large files.
- **C: Server-side job queue**
  - Renderer submits one job, server handles progress.
  - Highest complexity and unnecessary for local Electron copy.

We choose **A** for accurate progress and fewer large-file failures.

## Data flow

1. Renderer handles OS drop and builds a list of source paths.
2. Renderer calls `window.tenasElectron.startTransfer(...)`.
3. Main process copies:
   - Single file: stream copy with byte progress.
   - Folder: walk tree, sum total bytes, stream copy each file.
4. Main process emits progress events:
   - `transfer-progress`: { id, currentName, percent }
   - `transfer-error`: { id, reason }
   - `transfer-done`: { id }
5. Renderer updates minimal progress UI and refreshes the file list.

## UI (minimal)

- A fixed bottom bar in the file system panel.
- Shows only **current file name + percent**.
- Visible only while running or failed.
- On error, show text "failed" and a single **Retry** button.
- On success, auto-hide.

## Retry behavior

- Retry reuses the same job parameters.
- If a retry fails again, keep it in failed state.

## Error handling

- Validate source paths in main process.
- When a file disappears or permission is denied, emit `transfer-error`.
- Renderer shows retry and does not crash the panel.

## Testing

- Drag a 600MB file in Electron, verify progress and correct size.
- Drag a folder with nested files, verify all files copied.
- Trigger a failure (e.g., remove source file) and retry.

## Implementation plan (high level)

- Add IPC API for starting transfer and receiving progress events.
- Implement copy logic in Electron main (stream + folder walk).
- Add minimal progress bar component in file system panel.
- Wire renderer to start transfer on drop for large files/folders.
- Remove `importLocalFile` usage in Electron path.
