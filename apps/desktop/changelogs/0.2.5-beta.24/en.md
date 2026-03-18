---
version: 0.2.5-beta.24
date: 2026-03-19
---

## New Features

- Add end-to-end MCP server support across the AI runtime, server APIs, and desktop settings flows
- Add built-in skill registry and skill-first tool loading so agents can discover core capabilities more reliably
- Expand task context extraction and task detail experiences for richer agent progress visibility

## Improvements

- Improve MCP setup with reconnect-all actions, JSON config paste/import, smarter scope picking, and clearer project labels
- Improve chat pipeline resilience around message chaining, task-report syncing, prompt assembly, and MCP session guidance
- Refine tool rendering rules so successful hidden tools stay collapsed while supported, pending, and failed tool states remain visible

## UI Changes

- Add a dedicated MCP settings panel and server creation dialog with localized copy
- Refresh task detail and AI message presentation for clearer status, actions, and tool output handling
- Polish MCP dialog layout, scrolling behavior, and responsive overflow handling on smaller viewports

## Bug Fixes

- Fix task-report persistence, message counts, and task status cache alignment across server and web chat flows
- Fix MCP activation behavior to auto-connect configured servers without unnecessary approval friction
- Fix chat message rendering edge cases around reasoning blocks and empty tool wrappers
