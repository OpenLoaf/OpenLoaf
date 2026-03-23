---
version: 0.2.5-beta.31
date: 2026-03-24
---

## 0.2.5-beta.31

### ✨ New Features

- **Subscription center and billing entry points**: Added a dedicated subscription settings panel with current plan, billing period, credits usage, and transaction history, plus quick upgrade access from the sidebar account menu.
- **Embedded upgrade and recharge dialogs**: OpenLoaf now opens SaaS pricing and recharge flows inside native dialogs with token refresh, timeout fallback, and payment success handling.
- **Project feature toggles**: Project settings can now enable or disable homepage, history, canvas, and scheduled features in one place.
- **Board multi-input slot support**: Unified slot assignments now support multi-item media slots, slot restoration, and richer add/remove flows for associated references.
- **Audio-assisted video generation**: The Qwen video generation panel now accepts an optional audio input and keeps manual audio upload as a fallback path.

### 🚀 Improvements

- **Project creation flow**: New projects can auto-create their folder path from the configured storage root, with inline path preview and quick open support.
- **Project settings navigation**: Project settings now surfaces the current project icon and title in the side menu for better context while editing.
- **Desktop changelog visibility**: About page changelog loading now includes the current desktop version alongside server and web versions.
- **Subscription embed resilience**: Billing embeds now retry auth postMessage during hydration races and use a wider landscape layout to fit content more reliably.

### 💄 UI/UX

- **Board slot layout polish**: Active slots now render more cleanly in mixed single and multi-item states, with better chip counting and add-more affordances.
- **Sidebar and settings polish**: Refined sidebar icon button behavior, dialog sizing, and destructive action contrast across project and settings screens.
- **Sharper video first frame**: Video player now keeps the poster until `loadeddata`, reducing low-resolution or black-frame flashes before playback is ready.

### 🐛 Bug Fixes

- Fixed project reads to gracefully clean up missing project folders from registry and database, returning a stable `PROJECT_REMOVED` error for the frontend.
- Fixed new and temporary projects not enabling `canvas` by default.
- Fixed billing dialogs getting stuck when the iframe token or hydration timing raced the embed initialization.
- Fixed board media assignment persistence so multi-item slots store and restore arrays correctly instead of collapsing to a single ref.
- Fixed Qwen video generation payload assembly so connected audio is passed through as `inputs.audio` when available.
