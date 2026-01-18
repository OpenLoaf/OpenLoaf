# AI Command + Skill Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all legacy chat/image routes with a single `/ai/execute` pipeline, enforce “command only at input start”, and support `/skill/NAME` by storing `data-skill` parts while injecting skill content into the model.

**Architecture:** Introduce a reusable pipeline with explicit stages (parse → enrich → route → execute → persist). Commands and skills are first-class registries. Data parts are converted into model content via AI SDK `convertToModelMessages` with `convertDataPart`. Old endpoints and compatibility shims are removed.

**Tech Stack:** Next.js (React), ai-sdk (UIMessage + convertToModelMessages), Hono, tRPC, Prisma.

**Constraints:** Skip tests per user instruction; do not maintain backward compatibility with old endpoints or old data.

---

## Task 1: Define new request types and registries

**Files:**
- Create: `apps/server/src/ai/pipeline/aiTypes.ts`
- Create: `apps/server/src/ai/pipeline/commandRegistry.ts`
- Create: `apps/server/src/ai/pipeline/skillRegistry.ts`
- Modify: `packages/api/src/common/chatCommands.ts`
- Modify: `packages/api/src/types/message.ts`

**Step 1: Define pipeline request/response types**

- In `apps/server/src/ai/pipeline/aiTypes.ts`, add:
  - `AiExecuteRequest` (sessionId, messages, intent, responseMode, model selection, ids)
  - `AiIntent = "chat" | "image" | "command" | "utility"`
  - `AiResponseMode = "stream" | "json"`
  - `AiCommandContext`, `AiSkillContext` payload types.

**Step 2: Add shared constants**

- In `packages/api/src/common/chatCommands.ts`, add `SKILL_COMMAND_PREFIX = "/skill/"`.
- Keep command ids and tokens together for UI and server.

**Step 3: Add data-skill part type**

- In `packages/api/src/types/message.ts`, extend `TenasUIDataTypes` with:
  - `skill: { name, path, scope, content }`.

**Step 4: Create command registry**

- In `apps/server/src/ai/pipeline/commandRegistry.ts`, define:
  - `CommandDef { id, token, kind, handler }`.
  - `kind: "transform" | "session" | "direct"` for reuse.
  - Register `/summary-history`, `/summary-title` here (no compatibility with old handlers).

**Step 5: Create skill registry interface**

- In `apps/server/src/ai/pipeline/skillRegistry.ts`, define:
  - `SkillMatch` shape used by pipeline.
  - Resolver interface: `(name, roots) => SkillMatch | null`.

---

## Task 2: Implement skill resolution (project → parent → workspace)

**Files:**
- Modify: `apps/server/src/ai/agents/masterAgent/skillsLoader.ts`
- Create: `apps/server/src/ai/pipeline/skillResolver.ts`

**Step 1: Export skill reading utilities**

- In `skillsLoader.ts`, export helpers:
  - `stripSkillFrontMatter(content)`
  - `readSkillSummaryFromPath(path)`
  - `readSkillContentFromPath(path)`

**Step 2: Implement name-based resolver**

- In `skillResolver.ts`:
  - `resolveSkillByName(name, { projectRoot, parentRoots, workspaceRoot })`.
  - Search `.tenas/skills/**/SKILL.md` for match by front matter name; fallback to folder name.
  - Return first match using priority: current project → parent (near to far) → workspace.

**Step 3: Extract /skill/ tokens**

- Add `extractSkillNamesFromText(text)` to parse `/skill/NAME` tokens.
- De-duplicate while preserving order.

---

## Task 3: Build pipeline entry `/ai/execute`

**Files:**
- Create: `apps/server/src/routers/aiExecuteRoutes.ts`
- Modify: `apps/server/src/bootstrap/createApp.ts`
- Delete: `apps/server/src/routers/chatStreamRoutes.ts`
- Delete: `apps/server/src/routers/chatImageRoutes.ts`

**Step 1: Add `/ai/execute` route**

- New Hono route accepts `AiExecuteRequest`, validates intent/responseMode, and dispatches to pipeline.

**Step 2: Wire new route only**

- In `createApp.ts`, register `registerAiExecuteRoutes` and remove old chat/image routes.

**Step 3: Remove legacy routes**

- Delete old route files and any unused exports/imports.

---

## Task 4: Server pipeline stages (parse → enrich → route → execute)

**Files:**
- Create: `apps/server/src/ai/pipeline/aiPipeline.ts`
- Modify: `apps/server/src/ai/chat-stream/requestContext.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamHelpers.ts`
- Modify: `apps/server/src/ai/chat-stream/messageStore.ts`

**Step 1: Parse & command detection (prefix-only)**

- Implement `parseCommandAtStart(text, commandRegistry)`:
  - Only valid if the first non-whitespace token matches a command token.
  - If token is followed by more text, treat as non-command.

**Step 2: Enrich message with data-skill**

- When last message is user and NOT a command:
  - Extract `/skill/NAME` tokens from text parts.
  - Resolve skill content by priority.
  - Append `data-skill` parts to the same message.
  - Set requestContext `selectedSkills` to parsed names.

**Step 3: Persist user message with enriched parts**

- Save user message once, with both original text + data-skill parts.

**Step 4: Command routing**

- For command-at-start:
  - `transform` commands (summary-history) rewrite user message text into compact prompt and mark `messageKind`.
  - `session` commands (summary-title) bypass message persistence and operate only on session data.

---

## Task 5: AI SDK conversion with data part injection

**Files:**
- Modify: `apps/server/src/ai/chat-stream/streamOrchestrator.ts`
- Create: `apps/server/src/ai/pipeline/messageConverter.ts`

**Step 1: Add model message converter**

- In `messageConverter.ts`, implement `buildModelMessages(messages, tools)`:
  - Call `validateUIMessages`.
  - Call `convertToModelMessages` with `convertDataPart`.
  - When `type === "data-skill"`, return a `text` part:
    - `# Skill: {name}`
    - `<skill>` + content + `</skill>`.

**Step 2: Replace createAgentUIStream usage**

- Use `buildModelMessages` before `agent.stream()`.
- Preserve SSE output format and metadata handling.

---

## Task 6: Update front-end transport to `/ai/execute`

**Files:**
- Modify: `apps/web/src/lib/chat/transport.ts`
- Modify: `apps/web/src/components/board/nodes/lib/image-generation.ts`
- Modify: `apps/web/src/components/board/nodes/ImagePromptGenerateNode.tsx`
- Modify: `apps/web/src/components/board/nodes/ImageGenerateNode.tsx`

**Step 1: Switch transport endpoint**

- Point chat transport to `/ai/execute` and include `intent="chat"`, `responseMode="stream"`.

**Step 2: Update board image requests**

- Replace `/chat/sse` calls with `/ai/execute` and set:
  - `intent="image"`
  - `responseMode="stream"` or `json` depending on UI needs.

---

## Task 7: Command vs skill menu in ChatInput

**Files:**
- Modify: `apps/web/src/components/chat/ChatInput.tsx`
- Modify: `apps/web/src/components/chat/input/ChatCommandMenu.tsx`
- Modify: `apps/web/src/components/setting/skills/SkillsSettingsPanel.tsx` (types reuse only)

**Step 1: Determine slash context**

- Only treat as command if slash is the first non-whitespace content.
- Otherwise slash triggers skill list.

**Step 2: Load skills for menu**

- Query `trpc.settings.getSkills({ projectId })`.
- Filter `isEnabled` and build menu entries.

**Step 3: Nested menu behavior**

- Command mode:
  - Show command list + a root “技能” item.
  - Right arrow enters skill submenu; left arrow exits.
  - Up/Down cycle selection with wraparound.
  - Enter inserts command or `/skill/{name}`.
- Skill-only mode:
  - Show skills as top-level list.

---

## Task 8: Remove legacy compaction markers from client logic

**Files:**
- Modify: `apps/web/src/components/chat/ChatProvider.tsx`
- Modify: `apps/web/src/components/chat/ChatInput.tsx`

**Step 1: Delete old compact detection**

- Remove `/summary-history` checks that do not follow prefix-only rule.
- All command handling now flows through `/ai/execute`.

---

## Task 9: Documentation refresh

**Files:**
- Modify: `apps/server/src/ai/chat-flow.md`

**Step 1: Document new pipeline**

- Replace old `/chat/sse` and `/ai/image` flow with `/ai/execute`.
- Add `/skill/` parsing and `data-skill` conversion note.

---

## Testing & Verification (Skipped)

- Tests are intentionally skipped per instruction.

---

## Suggested Commit Points (Optional)

1) Types + registries
2) Skill resolver + command parsing
3) Pipeline + AI SDK bridge
4) Front-end transport + menu
5) Doc updates
