# OpenLoaf Desktop 0.2.5-beta.62

## ✨ New

- **macOS native control: per-window screenshot & enumeration.** New `list_windows` and `capture_window` ops in the Swift helper let the model see every renderable window for a target app (not just the frontmost) and grab a pixel-accurate shot of any single window by `windowID`. `observe` now returns a `windows[]` payload by default and exposes `axRichness` / `windowChildRoles` so the model can reason about UI density before acting.
- **WeChat channel agent end-to-end.** `qwen:OL-TX-008` (SaaS Fast Chat Model) is wired up as the channel-agent default for sub-3s ack-first SLO; new harness + identity + approval prompts ship per-language; `SendWeChatMedia` tool added for outbound image / video / file bubbles. `MacosObserve` / `MacosAct` are now reachable from the WeChat channel so users can remote-drive their Mac via IM.
- **macOS intent layer.** New `macosIntentRegistry` + `macosIntentRouter` resolve high-level user intents (`MacosAct type="intent"`) into concrete strategies, plus a new `MacosSurvey` tool for the "understand first" step before acting.
- **Notion MCP integration → deferred-load bundle.** Notion is now advertised as a single `notion-mcp` bundle in the preface; the model pulls the full toolset via `ToolSearch` on demand. Probe switched from `notion-get-self` (not always available) to `notion-get-users { user_id: "self" }`. New integration-identity module persists workspace identity per-account.
- **MCP mock infrastructure.** New `mcpMockStore` + `mcpMockRoutes` plus `mcpBundle` registry support deterministic browser tests and dev-time exploration without hitting real MCP servers.

## 🚀 Improvements

- **Late-registered MCP tools become visible mid-session.** `agentFactory` now merges live MCP tool IDs into `activeTools` on every step, so a tool that lands in the registry after a `ToolSearch` bundle call (e.g. Notion connecting on demand) is immediately callable instead of being filtered out for the rest of the session.
- **`macosControlTools.ts` decomposed.** Split into `macosCommon` (i18n + perm plumbing), `macosIntentRegistry`, `macosIntentRouter`, `macosSurveyTool`, `macosChromeGuard` for clearer ownership and easier extension.
- **Channel agent prompt restructured.** Shared `harness.{en,zh}.md` extracted; `identity` / `approval` rewritten; new tool-description overrides keep IM tone consistent across providers.
- **Cloud model mapper + provider adapters tightened.** `cloudModelMapper`, `providerAdapters`, `qwenAdapter`, `resolveChatModel` updated for the Fast model class; `modelRegistry` cleanup.
- **`ToolSearch` smarter.** Bundle resolution + ranking improvements (~156 line diff) so MCP bundles surface before generic tools.
- **WeChat AI bridge hardened** (~900 line diff): improved debounce, abort-on-new, cold-start batching, ack-first behaviour.

## 💄 UI

- **`ConnectionAccountRow`** extracted as a reusable status row used by the WeChat connection dialog.
- **Provider / Agent settings panels** polished — clearer dialog sizing, model checkbox UX, agent detail layout.

## 🌐 i18n

- en-US / zh-CN / zh-TW / ja-JP synced for `ai`, `connections`, `project`, `settings` namespaces.

## 🐛 Fixes

- `Chat.tsx` no longer threads the obsolete `canAttachAll` prop.
- Removed stale `requiredModelTags` test; agent template `types.ts` cleanup.

## 🔧 Refactor

- `tokenStore`, `authCallbackPage`, integration OAuth routes/service consolidated for shared identity flows.
- `auxiliaryInferenceService` + `auxiliaryMessageUtils` simplified.
- Settings: `auxiliaryModelConfStore`, `openloafConfStore`, `settingConfigTypes`, `settingsService` aligned with new model class.

## 📦 Dependencies

- `pnpm-lock.yaml` refreshed.
