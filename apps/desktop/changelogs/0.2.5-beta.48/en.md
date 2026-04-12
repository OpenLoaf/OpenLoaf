### ✨ New Features
- **Background task system**: new Jobs / Tail / Kill tools let the AI launch long-running shell commands in the background, stream their output on demand, and terminate them cleanly; a new BackgroundProcessBar surfaces live background work in the chat input area
- **Sleep tool**: AI can now defer work and wake itself on a timer, enabling self-paced polling loops and end-of-turn drain scheduling
- **End-of-turn drain loop**: pending background output is drained at the end of each turn so results surface without requiring a follow-up prompt
- **Cross-modal chip bar**: new ChipBar on image / text nodes lets you retarget generated content across modalities (image ↔ text ↔ video) in a single click
- **Tool progress streaming**: long-running tools now emit structured progress events (`data-tool-progress`) so the UI shows live status instead of a spinner

### 🚀 Improvements
- **Master prompt v5 finalized**: master & PM agents share a single `harness-v5` pipeline; hard rules trimmed further; ToolSearch guidance inlined; prompt assembly now fully bilingual (zh / en) with runtime language switching
- **Builtin skill consolidation**: `browser-automation-guide` merged into a new `browser-ops` skill; `office-document-guide` replaced by a unified `pdf-word-excel-pptx` skill; skill loader and index updated accordingly
- **Tool catalog overhaul**: every tool Zod schema in `packages/api/src/types/tools/` rewritten for tighter types, clearer descriptions, and better LLM tool-search matching; removed several `z.any()` escape hatches
- **Supervision service**: tool-call supervision hardened with richer test coverage around approval / drain edge cases
- **Context window management**: improved token accounting and trimming logic for long conversations
- **Model registry**: legacy `packages/api/src/common/modelRegistry.ts` removed; cloud model mapping consolidated in `cloudModelMapper`

### 🐛 Bug Fixes
- **Drain budget deadline** now starts from the first drain, not turn start, preventing premature timeouts on long tool chains
- **Pending approval** no longer triggers runaway while-loop drain; background tools moved to core tool set for consistent availability
- **Browser automation**: CDP client in desktop reworked with new `cdpUtils` helper for more reliable tab attachment and action dispatch
- **Shell sandbox**: command approval rules tightened; new test suite covers the approval matrix
- **Web fetch**: new regression tests around redirect / error handling

### 🔧 Refactoring
- **Rename**: `BgList` / `BgOutput` / `BgKill` → `Jobs` / `Tail` / `Kill` (clearer verbs, shorter names)
- **Rename**: `task-ops` skill / tool family → `schedule-ops`; deprecated `runtime-task-ops` removed entirely
- **Background process manager** split out of chat stream service into its own module (`services/background/`) with typed events and clean shutdown hooks
- **Chat UI**: `MessageItem`, `MessageAi`, `MessageHelper` refactored; tool renderers (`UnifiedTool`, `OpenUrlTool`, `RequestUserInputTool`, `ShellTool`) tightened; new `JobsTool`, `SleepTool`, `LoadSkillTool`, `BrowserActionTool` renderers
- **Desktop IPC**: CDP-related IPC handlers split into dedicated `cdpUtils` module; preload API surface cleaned up
