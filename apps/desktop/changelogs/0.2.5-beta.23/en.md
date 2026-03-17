---
version: 0.2.5-beta.23
date: 2026-03-18
---

## New Features

- Add async chat streaming with dedicated session management and end-to-end regression coverage
- Add memory-save support with persisted chat asset storage and scoped memory file operations
- Add user and project memory management APIs for listing, editing, and clearing memory files

## Improvements

- Improve async chat transport, message chaining, and stream session recovery across server and web
- Improve chat file persistence and asset-folder resolution for async conversations and memory workflows
- Strengthen desktop auto-update status handling and release-note propagation after downloads

## UI Changes

- Add a richer Memory settings panel with file list, inline editing, open-folder access, and clear-all actions
- Improve message list rendering and async chat state updates in the AI conversation view
- Refresh localized settings copy for memory management across en-US, zh-CN, and zh-TW

## Bug Fixes

- Fix message-store persistence details for async streaming sessions and memory-linked files
- Fix tool scope and memory tool behavior around writable paths and saved context files
- Fix desktop release process guidance so changelog files are required before tagging a new beta
