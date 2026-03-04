---
version: 0.2.5-beta.3
date: 2026-03-05
---

## ✨ New Features

- Added a new Master Agent Prompt v2 template and related config entry points to better support multi-model chat scenarios
- Improved Codex and Claude Code option interactions in chat input, with clearer mode and preference flows

## 🚀 Improvements

- Refactored chat streaming and attachment route handling to improve message assembly, transport, and preface stability
- Improved task cards, loading state, and selected sidebar/file-system interactions for smoother UX
- Updated i18n copy and settings structures to reduce frontend/backend config drift

## 🐛 Bug Fixes

- Fixed edge cases in Desktop auto-update flow to improve update detection and state transition reliability
- Fixed inconsistent behavior in parts of settings read/write flows to reduce config write-back failures
