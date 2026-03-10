---
version: 0.2.5-beta.14
date: 2026-03-10
---

## New Features

- Double-click empty canvas area to create a text node with auto-focus
- Duplicate board now opens in a new tab automatically
- Add PDF and PowerPoint file detection with tool-search guidance in AI readFile tool

## Improvements

- Board thumbnail: save/restore viewport state to avoid view jumping during capture
- Board thumbnail: always re-capture on canvas open to ensure freshness
- Synchronous thumbnail capture on board close for reliability
- Auto-layout: auto-detect and preserve alignment (left/center/right, top/center/bottom)
- Batch auto-resize updates via requestAnimationFrame for performance
- Cache elements array in CanvasDoc to reduce repeated allocations
- Optimize SpatialIndex updates by skipping remove+insert when cell keys unchanged
- Support dynamic min size resolution per node type
- Only show mindmap direction controls for text-to-text node connections
- Save generated images directly to board asset directory when boardId is present
- Add macOS Intel (x64) cross-compilation build scripts

## UI Changes

- Redesign close confirm dialog with three direct action buttons (Cancel / Minimize / Quit)
- Group node: show solid background instead of dashed border
- Group toolbar: only show uniform size button for media-type groups
- Allow text selection during node editing mode

## Bug Fixes

- Fix PowerShell UTF-8 encoding on Chinese Windows (force UTF-8 output encoding)
- Handle corrupted board binary snapshots with automatic backup and JSON recovery fallback
- Handle ENOENT gracefully in fs.stat and listImages routes
- Fix VFS path resolution for bare @[folderName] format
- Fix Windows incremental update: remove junction points before deleting update directories to prevent destroying bundled dependencies

## Removed

- Remove "Create Board" from filesystem context menu and empty state

## Internationalization

- Update translations for zh-CN, zh-TW, en-US across multiple namespaces
