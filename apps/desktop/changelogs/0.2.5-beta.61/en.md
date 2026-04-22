## What's Changed

### ✨ New Features

- **WeChat integration**: New channel adapter that bridges WeChat conversations into OpenLoaf ChatSession. Includes per-account poll worker, send/mock services, AI bridge, QR binding UI, and unified session rendering.
- **macOS control**: New `MacosObserve` / `MacosAct` tools with native Screenshot.swift implementation. Tool descriptions and skill docs refreshed; `click` is now preferred over `ax_action` for standard clicks.
- **Context compression**: Step-budget soft landing and truncated-output handling keep long multi-turn sessions coherent when they approach model limits.

### 🚀 Improvements

- **Chat panel independence**: The right-side AI chat panel no longer reacts to sidebar navigation. Chat state lives in a dedicated store keyed per scope (global / projectId), so switching sections keeps the stream alive and preserves panel widths and visibility as user preferences.
- **PPTX viewer**: Rewritten around canvas rendering with zoom controls, keyboard shortcuts, and better slide navigation / error handling.
- **Tool registry**: Project, docConvert, and macOS control tool descriptions sharpened so the model picks the right tool more reliably.
- **Master prompt discipline**: New regression test locks down harness behavior to avoid drift between prompt edits.

### 💄 UI

- **Connections**: Redesigned install dialog with clearer copy, icons, and per-integration setup flows.
- **File viewers**: Consistent lifecycle and save-as handling across Audio / Doc / Excel / Markdown / PDF / PPTX / Video viewers; FilePreviewDialog wires sessionId through props for stack viewers outside ChatSessionProvider.
- **Layout**: Sidebar, StackHeader, and LeftDock polish; navigation no longer forces `leftWidthPercent` or right-chat collapse.

### 🌐 i18n

- Refreshed en / zh-CN / zh-TW / ja-JP strings for AI, connections, and common namespaces.

### 🗄️ Database

- Migration `20260423000000_drop_chat_session_wechat_peer_id` aligns the ChatSession schema with the new WeChat channel model.

### 🐛 Fixes

- Browser test `019-context-compression-large-text` now reads `msg.parts` instead of the legacy `msg.content` field, unblocking `pnpm check-types`.
