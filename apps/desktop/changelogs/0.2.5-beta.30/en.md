---
version: 0.2.5-beta.30
date: 2026-03-23
---

## 0.2.5-beta.30

### ✨ New Features

- **Capability-driven connector picker**: Board connector insertion now groups available targets by image, video, audio, and text based on live SaaS capabilities, with localized feature icons and labels for faster node creation.
- **Inline connector delete affordance**: Hovering or selecting a connector now surfaces a scissors action at the midpoint so links can be removed directly on canvas.

### 🚀 Improvements

- **Board capability preloading**: Board now preloads image, video, and audio capabilities on entry and exposes retry handling when capability fetches fail, keeping connector templates available more reliably.
- **Connector flow polish**: Closing the connector picker or cancelling a draft now restores the source node selection, making follow-up edits smoother after drag-to-connect actions.

### 💄 UI/UX

- **Magnetic anchor feedback**: Image anchors now fade in with magnetic follow motion near the cursor and bounce back on exit, making connection targets feel clearer and more tactile.
- **Node label layout**: Refined label scaling and truncation so long titles stay readable during zoom without crowding node chrome.

### 🐛 Bug Fixes

- Fixed connector template resolution so output targets are derived from registered capability variants instead of stale static feature mapping.
- Fixed board image variants to expose explicit feature IDs for capability matching, preventing some generation entries from disappearing in the picker.
