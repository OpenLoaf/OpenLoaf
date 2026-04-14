### ✨ New Features
- **Third-party integrations**: new Connections market page lets you browse, install, and manage third-party connectors; settings i18n expanded across all locales.
- **Session auto-test evaluation**: AI chat sessions can now be evaluated against regression baselines directly from the debug viewer.
- **Cloud tools in chat**: built-in cloud model tools (image/video/web-search/login) exposed to the chat agent with progress UI and approval flow.

### 🚀 Improvements
- **AI prompt/memory/tooling rearchitecture**: chat prompt assembler, memory loader, tool scope resolver, and agent model resolution unified into a single pipeline — faster cold starts, more consistent skill injection, and deduped memory/skill content.
- **Token management centralized on server**: SaaS access tokens now live exclusively on the server; the web client no longer extracts or forwards bearer tokens, and strict-client-guard covers all browser entry points.
- **Parallel macOS build in CI**: Desktop release workflow builds arm64 and x64 in parallel; changelog files under `apps/desktop/changelogs/{version}/` are now the single source of truth for GitHub Release notes.
- **Friendly editor chat errors**: the editor chat surface now shows a localized error card when the configured chat model isn't ready instead of a silent failure.

### 🐛 Bug Fixes
- **Canvas node delete — lingering anchors**: deleting a canvas node no longer leaves its anchor handles fading on their own for half a second. The anchor overlay now drops anchors whose underlying element is already gone, so node + anchors disappear in lockstep.
- **Canvas image/video generate — cancel button unresponsive**: the cancel button inside the generating overlay is now properly wired through `SelectTool`'s pointer-down whitelist (`data-board-controls` + `stopPropagation`), so clicks actually abort the task instead of being swallowed by the canvas drag handler.
- **CLI rewind context loss**: continuing an assistant turn after a CLI rewind no longer drops the preserved context.
- **CLI direct mode model source**: `chatModelSource` is now propagated alongside `chatModelId` so direct-mode requests route to the correct provider.

### 🔧 Refactor
- Removed deprecated `modelDefaultChatModelId` field from agent config.
- Deleted legacy image/video model UI panels from agent settings (now driven purely by cloud capabilities).
- Reclassified `basicConfig.chatSource` as active UI state.
- Collapsed ad-hoc `body → resolveChatModel` plumbing into a single helper; unified 5 descriptor-shape parses in `resolveAgentModelIdsFromConfig`.

### 📦 Internal
- Added temp-storage bootstrap migration so legacy global AI data is moved into per-session temp storage on first launch.
