---
version: 0.2.5-beta.33
date: 2026-03-24
---

## 0.2.5-beta.33

### ✨ New Features

- **Inline mask painting for image edit flows**: Added paintable mask slots for supported image edit variants, with on-canvas masking, preview chips, and integrated brush, undo, and redo controls directly in the input bar.
- **Richer generation controls across media variants**: Added more variant-specific controls, including output count, image size, prompt extension, negative prompt, video resolution, shot type, lip-sync video extension, and face-threshold tuning.

### 🚀 Improvements

- **Faster generation feedback**: Image and video generation nodes now enter loading state immediately, while media uploads continue in the background before task submission.
- **Smarter media uploads**: Large images are now compressed before upload on both web and server, reducing oversized payloads and improving generation reliability.
- **Refined login callback page**: Refreshed the auth callback screen with a more polished OpenLoaf presentation and automatic return-to-app behavior after success.
- **Better media replacement sizing**: Replaced images and videos now resize nodes using actual image ratios and video metadata for more natural board layouts.
- **Official website entry points**: Added quick links to the official OpenLoaf website from the account menu and About page.

### 💄 UI/UX

- **Board panel polish**: Improved mask-slot presentation, panel overlay layering, and anchor rendering for cleaner canvas interactions.
- **Dialog and action polish**: Expanded the pricing dialog layout and improved destructive action contrast in mail and memory settings.
- **Video generation feedback polish**: Adjusted video node generating visuals to avoid empty-state flicker and use a clearer blue progress tone.

### ⚡ Performance

- **Lighter board history snapshots**: Optimized board history cloning and equality checks to avoid repeatedly duplicating large data URL payloads.

### 🌐 Internationalization

- **New localized labels**: Added localized strings for mask slots and official website entries across supported languages.
- **Chat input label fix**: Corrected the cancel label lookup in the chat input.

### 🐛 Bug Fixes

- Fixed board-scoped file persistence so temp boards and project boards consistently resolve assets, thumbnails, metadata, AI board naming, previews, and delete actions through `boardId`.
- Fixed media proxy path recovery and task restoration when only `boardId` is available, including restart recovery scenarios.
- Fixed board image and video downloads so they recover the real project scope from `boardId` when `projectId` is missing.
- Fixed generated media save results to always return board-relative paths, avoiding duplicated path assembly on the frontend.
- Fixed connector completion behavior so connecting into an existing node keeps the destination node selected.
- Fixed board previews, quick actions, and file open flows to pass the correct `boardId` context when opening boards.
- Fixed board media upload paths in tools, viewers, and generation panels when only board-scoped paths are available.
- Fixed text generation submit handling so Enter does not fire while an IME composition is still active.
