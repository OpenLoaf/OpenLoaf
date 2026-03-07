---
version: 0.2.5-beta.5
date: 2026-03-07
---

## ✨ New Features

- Canvas context menu: copy path, rename, move to project, AI naming, delete
- Full context menu operations for canvas list (Canvas/Mixed views)

## 🚀 Improvements

- AI board naming now passes SaaS access token; prompts login when unauthenticated
- Chat feedback submission simplified to SDK-only, removed HTTP fallback
- Temporary conversations no longer show the history button
- Board snapshot to Markdown supports more node property formats (image, image_generate, etc.)
- `boardFolderUri` now supports `file://` URI format parsing

## 💄 UI Improvements

- Sidebar project tree skeleton colors adjusted

## 🌐 Internationalization

- README primary language switched to English
- Added canvas management translation keys (copy path, move to project, etc.)

## 🐛 Bug Fixes

- Fixed CLI tool version extraction returning raw string instead of null on no match
- Fixed `inferBoardName` missing requestContext causing authentication issues

## 📦 Dependencies

- Updated server, web, and api package dependency versions
