---
version: 0.2.5-beta.36
date: 2026-03-26
---

## 0.2.5-beta.36

### ✨ New Features

- **Persistent AI panel drafts across media workflows**: Board image, video, and audio panels now keep text-slot content and other user edits across panel remounts and generation cycles, making prompt iteration much safer.
- **Queue-aware media generation inputs**: The v3 media workflow now supports richer remote capability metadata, slot declarations, catalog options, and queue ticket handling for newer SaaS media variants.
- **Redeem code dialogs in settings**: Subscription settings now split redeem actions into dedicated "Enter Code" and "View Records" dialogs with updated localized copy.

### 🚀 Improvements

- **Simplified SaaS media transport**: Capabilities, credit estimates, task events, and task cancellation now use more direct SDK and SSE paths, while the server keeps only the proxy routes that still need backend mediation.
- **Cleaner generated-media save path resolution**: Shared media storage helpers now normalize project-scoped and relative save directories more consistently for board and project outputs.
- **Refreshed macOS installer presentation**: Desktop packaging now includes a custom DMG background flow, with Apple Silicon-specific fixes so Finder can render the installer artwork correctly.

### 💄 UI/UX

- **More focused redemption experience**: Redeem history is loaded only when the history dialog opens, which cuts background requests and keeps the settings page lighter.
- **More stable Board generation flow**: Text-slot restore behavior, panel snapshots, and regeneration state handling are more predictable when reopening AI panels or starting repeated runs.

### 🐛 Bug Fixes

- Fixed late text-slot restore cases where cached user text could overwrite newly auto-inserted content.
- Fixed stale cache state in video and audio generation flows, and removed old seed-related schema mismatches from the v3 media pipeline.
- Fixed SaaS media error handling so upstream messages can be surfaced instead of always falling back to a generic connection failure.
