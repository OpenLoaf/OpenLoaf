## What's New

### ✨ New Features
- Unified file mentions and media input workflows in AI chat
- Per-version parameter restore for Audio/Video AI panels with draft mode (snapshot/restore on edit cancel)

### 🚀 Improvements
- Unified chat file paths to `[sessionId]/asset/filename` format
- Inline chip rendering for human message file mentions
- Added `resolveMediaTypeFromPath` utility for MessageFile

### 🐛 Bug Fixes
- Fixed `[sessionId]` path resolution in tool scope path resolver
- Fixed chat-history file opening via preview endpoint instead of VFS
- Normalized historical `../chat-history/` paths in mention click handler
- Fixed `uploadGenericFile` to prevent `../` path traversal
- Fixed type error in URL download route mime type parsing

### 🔧 Refactoring
- Simplified GenerateActionBar by removing redundant regenerate confirmation popover
- Updated system prompts to use `[sessionId]` path format with format examples
