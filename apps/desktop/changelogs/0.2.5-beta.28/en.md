---
version: 0.2.5-beta.28
date: 2026-03-23
---

## 0.2.5-beta.28

### ✨ New Features

- **Board anchor slot workflow**: Added typed input/output slots, dynamic node templates, grouped node insertion, real-time connection validation, and text `@` references so media and prompt nodes can be connected more naturally.
- **Expanded media generation toolkit**: Introduced new image, video, and audio generation variants, migrated generation flows to the newer SaaS media endpoints, and refreshed the variant architecture for richer capability-specific inputs.
- **Inline image adjustment**: Added a full-screen image adjustment overlay with crop, rotate, and flip actions for image nodes.

### 🚀 Improvements

- **Media upload and playback pipeline**: Improved board upload flow, media task orchestration, remote video ingestion, and video streaming playback to make generated and downloaded media more reliable inside the app.
- **Board editing experience**: Refined media panels, selection and insertion interactions, toolbars, version stack hooks, and grouped node picking for faster canvas operations.
- **Chat and file experience**: Polished chat tool rendering, attachment handling, session behavior, and video/file preview flows to better match the updated media pipeline.

### 💄 UI/UX

- Refreshed multiple desktop surfaces across sidebar, project/file views, settings, tasks, widgets, and loading states for a more consistent in-app experience.

### 🌐 Internationalization

- Added and updated multilingual strings for the new board media panels, input slot system, image adjustment controls, and related AI/chat surfaces.

### 🐛 Bug Fixes

- Fixed several media playback, upstream data flow, variant labeling, and translation mismatches discovered during the board media refactor.
- Resolved post-merge type issues in the new media download and image adjustment paths.
- Fixed the Desktop publish workflow to avoid `npm version` failures on workspaces that use `catalog:` dependencies.

### 📦 Dependencies

- Upgraded `@openloaf-saas/sdk` integrations to newer media API generations used by the updated board workflows.
