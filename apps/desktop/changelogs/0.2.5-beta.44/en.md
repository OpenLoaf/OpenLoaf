## What's New

### ✨ Unified Tool Naming (PascalCase)
- All tool IDs renamed from kebab-case to PascalCase for consistency
- `AskUserQuestion` tool renamed with simplified schema
- Agent tools refactored: `SpawnAgent`/`WaitAgent` replaced with unified SubAgent system and new `SendMessage` tool

### 🚀 Enhanced Tool UI Renderers
- New dedicated renderers for `Glob`, `Grep`, and `Read` tools
- New `SubAgentPanel` component for inline sub-agent conversation display
- Improved `RequestUserInput` tool with enhanced approval UX

### 🎨 Board & Canvas Enhancements
- Audio node: recording capability with waveform visualization
- Text AI panel: multi-feature tab system with skill slot bar
- Video node: improved playback controls
- Text node: refined editing experience

### 💄 UI Improvements
- ChatInput layout simplification
- Project card stagger animation skip on cache hit
- Model preferences panel cleanup
- Chat command menu enhancements

### 🐛 Bug Fixes
- Fixed remaining kebab-case tool type residuals across web and server
- Fixed tool registry and capability group alignment
