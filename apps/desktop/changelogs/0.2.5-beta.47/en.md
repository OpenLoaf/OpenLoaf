### ✨ New Features
- Canvas empty guide redesigned as a conversational entry — describe your goal in a sentence and the canvas is set up for you, with example prompts for image / video / audio / storyboard workflows
- New AI preference: switch built-in Master / PM agent system prompts between 中文 and English (defaults to English)
- New "Open in Current Window" context-menu action for canvases, alongside "Open in New Window"
- Sub-agent panels now participate in the version-stack overlay with a dedicated title

### 🚀 Improvements
- AI prompt pipeline v5: master agent rewritten as a lean identity + skill-routing prompt sharing a new `harness-v5` with the PM agent; hard rules trimmed from ~380 to ~70 lines; system-skills block no longer truncates skill descriptions so ToolSearch can match the full vocabulary
- Builtin skill consolidation: `multi-agent-routing` + `system-agent-architecture` merged into a single `agent-orchestration` skill; `memory-ops` guidance inlined into the harness as always-on behavior; `openloaf-basics` baseline skill removed. Builtin skill count: 16 → 14
- Insert-tool labels clarified across all locales ("Write text" / "Generate image with AI" / ...) for en / zh-CN / zh-TW / ja
- AI debug viewer now exposes richer prompt-assembly and tool-search state
- Text node editing: substantial TextNode rewrite improving inline editing, streaming updates, and variant handling; TextAiPanel and V3 stream hook reworked accordingly
- Tool-search rehydrate: more robust state reconstruction across retries, with expanded regression tests

### 🐛 Bug Fixes
- Ship the previously missing `runtime-task-ops` SKILL.md so fresh clones build
- VersionStackOverlay moved into the NodeFrame layer to avoid scroll-container clipping

### 🔧 Refactoring
- Removed the legacy board context menu and workflow-template picker in favor of the new empty-guide entry flow
- `BoardCanvasInteraction` slimmed by ~480 lines; empty guide, grouped node picker, and selection overlay reorganized
- Chat stream service, image request orchestrator, preface builder, and request context updated to thread `promptLanguage` through the pipeline
