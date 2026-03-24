---
version: 0.2.5-beta.35
date: 2026-03-24
---

## 0.2.5-beta.35

### ✨ New Features

- **Audio extraction from board videos**: Video nodes can now extract an audio track directly into a derived audio node, including clipped ranges from trimmed videos.
- **Richer canvas creation flow**: The canvas create dialog now supports custom canvas names and a searchable project picker with nested project structure.
- **Media inspector details**: Image, audio, and video nodes now expose file name, format, duration, resolution, file size, and storage location from the board inspector.

### 🚀 Improvements

- **Direct video playback pipeline**: Board videos and file previews now use direct stream and frame endpoints instead of the previous HLS thumbnail pipeline, simplifying playback and trim preview flows.
- **Safer desktop memory behavior**: Desktop builds now disable accelerated video decode, avoid auto-opening DevTools in development, and record periodic Electron memory diagnostics for video-heavy sessions.
- **Smarter paste placement**: Pasted board content can now be centered around a target point instead of always using a fixed offset.

### 💄 UI/UX

- **More tactile board dragging**: Node dragging now adds tilt and elevation feedback, snaps to grid on drop, and hides in-node controls while dragging for a cleaner motion feel.
- **Animated anchor and connector polish**: Anchor handles now use magnetic follow and graceful fade-out timing, while selected connectors get stronger flow animation and filled arrowheads.
- **Cleaner selection tooling**: Inspect, lock, and delete actions are now unified in the shared selection toolbar, with improved tooltip behavior and more compact media-node actions.

### 🌐 Internationalization

- **New localized board copy**: Added translations for canvas naming, project search, empty search states, and media inspector fields across supported locales.

### 🐛 Bug Fixes

- Fixed video preview and trim flows to resolve board/project-scoped media through the new direct streaming endpoints instead of fragile HLS manifest generation.
- Fixed inline video playback cleanup so media elements release buffered resources after playback, reducing memory pressure during repeated previews.
- Fixed selection behavior so dragging an unselected node no longer flashes selection UI before the drag actually starts.
