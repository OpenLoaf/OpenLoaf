---
version: 0.2.5-beta.21
date: 2026-03-17
---

## New Features

- Add page-context based auto skill loading with new built-in operations skills for canvas, projects, files, tasks, email, calendar, settings, and workbench
- Add video-download and web-fetch AI tools with shared tool catalog metadata and dedicated result cards
- Add board video trimming with HLS polling, thumbnail filmstrip, and clip range controls

## Improvements

- Refactor chat runtime into focused approval, session, message, and sub-agent stream hooks for more stable streaming behavior
- Improve temp project creation and migrate existing chat history into project scope when tools need writable storage
- Strengthen tool registry, command approval checks, tool-call repair, and runtime tool schema coverage
- Enhance embedded desktop browser views with richer status and network reporting
- Add a root `pnpm kill` helper to clean stale local dev processes

## UI Changes

- Refresh skill settings with title translation, metadata controls, color management, and updated localized copy
- Polish board video presentation, project list interactions, file transfer flows, and dock/tab behaviors
- Improve AI tool rendering for downloads, office tools, and message part presentation

## Bug Fixes

- Fix streaming message buffering, tool part persistence, approval continuation, and office tool input normalization
- Improve video download retry handling, metadata extraction, and preview/save behavior across chat and board contexts
- Fix browser view IPC synchronization for embedded Electron tabs

## Internationalization

- Update AI, board, navigation, project, and settings locales across en-US, zh-CN, and zh-TW
