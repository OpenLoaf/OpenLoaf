# Frontend-Executed Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `open-url` with a unified frontend-executed tool flow using a server wait + frontend ack mechanism.

**Architecture:** Add a server-side pending registry keyed by `toolCallId`, a frontend ack HTTP endpoint, and a frontend executor registry. The server waits for ack (default 60s, `timeoutSec` override), then returns the frontend result.

**Tech Stack:** Node/TypeScript, Hono/tRPC (server), React/Next (web), zod.

> Note: Project rule for superpowers skills says skip TDD; this plan avoids TDD steps and focuses on implementation + light verification.

### Task 1: Add shared types for frontend execution + ack payload

**Files:**
- Modify: `packages/api/src/types/tools/browser.ts`
- Modify: `packages/api/src/types/tools/` (new shared base if needed)
- Modify: `packages/api/src/types/message.ts` (if needed for tool metadata)

**Step 1: Add `timeoutSec` to `openUrlToolDef.parameters`**
- Update zod schema to include optional `timeoutSec: z.number().int().positive().optional()`

**Step 2: Commit**
```bash
git add packages/api/src/types/tools/browser.ts
# add other touched type files
git commit -m "feat: add timeoutSec for open-url"
```

### Task 2: Server pending registry and ack endpoint

**Files:**
- Create: `apps/server/src/ai/tools/frontend/pendingRegistry.ts`
- Create: `apps/server/src/routes/toolAck.ts` (or tRPC mutation in `apps/server/src/routers/`)
- Modify: `apps/server/src/app.ts` (or router registration file)

**Step 1: Implement pending registry**
- Map `toolCallId -> { resolve, reject, timer, deadline }`.
- `registerPending(toolCallId, timeoutSec)` returns promise and registers timer.
- `resolvePending(toolCallId, payload)` clears timer and resolves.
- `timeoutPending(toolCallId)` resolves with `{ status: "timeout" }` and clears.

**Step 2: Add ack HTTP endpoint**
- Validate payload: `toolCallId`, `status`, `output`, `errorText`, `requestedAt` (ISO).
- If pending exists: resolve and return `{ ok: true }`.
- Else: return 404/410 with `{ ok: false, reason }`.

**Step 3: Wire route**
- Register route with server.

**Step 4: Commit**
```bash
git add apps/server/src/ai/tools/frontend/pendingRegistry.ts apps/server/src/routes/toolAck.ts apps/server/src/app.ts
# include other touched files
git commit -m "feat: add frontend tool ack endpoint and pending registry"
```

### Task 3: Update open-url tool to wait for frontend ack

**Files:**
- Modify: `apps/server/src/ai/tools/ui/openUrl.ts`

**Step 1: Remove data part write**
- Delete `writer.write({ type: "data-open-browser", ... })`.

**Step 2: Register pending and await**
- Use `toolCallId` from the tool invocation (ensure it is available in context).
- Call `registerPending(toolCallId, timeoutSec ?? 60)`.
- `await` promise and return its payload.

**Step 3: Commit**
```bash
git add apps/server/src/ai/tools/ui/openUrl.ts
git commit -m "feat: open-url waits for frontend ack"
```

### Task 4: Frontend executor + open-url handler

**Files:**
- Create: `apps/web/src/lib/chat/frontendToolExecutor.ts`
- Modify: `apps/web/src/components/chat/ChatProvider.tsx`
- Modify: `apps/web/src/hooks/browser-panel.ts` (reuse existing open logic)

**Step 1: Implement executor registry**
- `register(toolId, handler)`.
- `execute({ toolCallId, input })` runs handler and posts ack to `/api/tools/ack`.

**Step 2: Add open-url handler**
- Open browser panel via `pushStackItem` with `__open` params.
- On success: `status: "success"` with `{ url, viewKey }` output.
- On failure: `status: "failed"` with `errorText`.

**Step 3: Wire in ChatProvider**
- When tool input arrives for frontend-executed tools, call executor.
- Ensure handler runs only once per `toolCallId`.

**Step 4: Commit**
```bash
git add apps/web/src/lib/chat/frontendToolExecutor.ts apps/web/src/components/chat/ChatProvider.tsx
# include any other touched files
git commit -m "feat: frontend tool executor and open-url handler"
```

### Task 5: Remove/disable legacy data-open-browser flow

**Files:**
- Modify: `apps/web/src/components/chat/ChatProvider.tsx`
- Modify: `apps/server/src/ai/tools/ui/openUrl.ts`

**Step 1: Remove `data-open-browser` handler path**
- Delete or disable `handleOpenBrowserDataPart` usage if no longer needed.

**Step 2: Commit**
```bash
git add apps/web/src/components/chat/ChatProvider.tsx
# include any other touched files
git commit -m "chore: remove legacy open-browser data part flow"
```

### Task 6: Manual verification

**Step 1: Run dev server**
```bash
pnpm dev:web
```

**Step 2: Trigger open-url tool**
- Verify: browser panel opens.
- Verify: tool output resolves (not stuck).

**Step 3: Commit (if any follow-up fixes)**
```bash
git add <touched files>
git commit -m "fix: frontend tool ack follow-ups"
```
