# Json Render Approval Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a json-render tool that builds a UI from a UITree input, collects user input, sends values via `toolApprovalPayloads`, and returns values to the agent after approval.

**Architecture:** The frontend renders a custom tool UI with `@json-render/react` and submits values keyed by `toolCallId`. The request body carries `toolApprovalPayloads` to the server, which stores them in `RequestContext` and lets the tool consume-and-clear values during execution.

**Tech Stack:** React/Next.js, `@json-render/react`, `@json-render/core`, AI SDK v6, Hono, Zod.

**Project Note:** Skip TDD tests and no worktree creation per project rules.

### Task 1: Add request payload types

**Files:**
- Modify: `packages/api/src/types/message.ts`
- Modify: `apps/server/src/ai/application/dto/aiTypes.ts`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

Add the payload type to request bodies:

```ts
// packages/api/src/types/message.ts
  /** Tool approval payloads keyed by toolCallId. */
  toolApprovalPayloads?: Record<string, Record<string, unknown>>;
```

```ts
// apps/server/src/ai/application/dto/aiTypes.ts
  /** Tool approval payloads keyed by toolCallId. */
  toolApprovalPayloads?: Record<string, Record<string, unknown>>;
```

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add packages/api/src/types/message.ts apps/server/src/ai/application/dto/aiTypes.ts
git commit -m "feat: add tool approval payload type to requests"
```

### Task 2: Parse and propagate toolApprovalPayloads into RequestContext

**Files:**
- Modify: `apps/server/src/ai/interface/routes/aiExecuteRoutes.ts`
- Modify: `apps/server/src/ai/application/use-cases/AiExecuteService.ts`
- Modify: `apps/server/src/ai/application/services/chatStream/chatStreamService.ts`
- Modify: `apps/server/src/ai/shared/context/requestContext.ts`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

Parse payloads in the request:

```ts
// apps/server/src/ai/interface/routes/aiExecuteRoutes.ts
  const toolApprovalPayloads = normalizeToolApprovalPayloads(raw.toolApprovalPayloads);
  ...
  toolApprovalPayloads,
```

Propagate through the use-case:

```ts
// apps/server/src/ai/application/use-cases/AiExecuteService.ts
    toolApprovalPayloads: input.request.toolApprovalPayloads,
```

Inject into request context and add a consume helper:

```ts
// apps/server/src/ai/shared/context/requestContext.ts
  /** Tool approval payloads keyed by toolCallId. */
  toolApprovalPayloads?: Record<string, Record<string, unknown>>;
```

```ts
/** Consume approval payloads by toolCallId. */
export function consumeToolApprovalPayload(toolCallId: string) {
  const ctx = getRequestContext();
  if (!ctx?.toolApprovalPayloads) return undefined;
  const payload = ctx.toolApprovalPayloads[toolCallId];
  if (payload) {
    delete ctx.toolApprovalPayloads[toolCallId];
  }
  return payload;
}
```

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add apps/server/src/ai/interface/routes/aiExecuteRoutes.ts \
  apps/server/src/ai/application/use-cases/AiExecuteService.ts \
  apps/server/src/ai/application/services/chatStream/chatStreamService.ts \
  apps/server/src/ai/shared/context/requestContext.ts
git commit -m "feat: propagate tool approval payloads into request context"
```

### Task 3: Add json-render tool definition and server implementation

**Files:**
- Create: `packages/api/src/types/tools/jsonRender.ts`
- Modify: `packages/api/src/types/tools/index.ts`
- Create: `apps/server/src/ai/tools/ui/jsonRenderTool.ts`
- Modify: `apps/server/src/ai/registry/toolRegistry.ts`
- Modify: `apps/server/src/ai/agents/masterAgent/masterAgent.ts`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

Define the tool (needs approval) with UITree input:

```ts
// packages/api/src/types/tools/jsonRender.ts
export const jsonRenderToolDef = {
  id: "json-render",
  name: "JSON 渲染表单",
  description: "Use UITree to render a form. Use action 'submit' or 'cancel'.",
  parameters: z.object({
    actionName: z.string().min(1),
    tree: z.object({
      root: z.string().min(1),
      elements: z.record(z.any()),
    }),
    initialData: z.record(z.any()).optional(),
  }),
  needsApproval: true,
  component: null,
} as const;
```

Implement tool execution by consuming payloads:

```ts
// apps/server/src/ai/tools/ui/jsonRenderTool.ts
export const jsonRenderTool = tool({
  description: jsonRenderToolDef.description,
  inputSchema: zodSchema(jsonRenderToolDef.parameters),
  needsApproval: true,
  execute: async (_input, options) => {
    const toolCallId = options.toolCallId;
    if (!toolCallId) throw new Error("toolCallId is required.");
    const payload = consumeToolApprovalPayload(toolCallId);
    if (!payload) throw new Error("tool approval payload is missing.");
    return payload;
  },
});
```

Register tool in registry and master agent tool list.

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add packages/api/src/types/tools/jsonRender.ts \
  packages/api/src/types/tools/index.ts \
  apps/server/src/ai/tools/ui/jsonRenderTool.ts \
  apps/server/src/ai/registry/toolRegistry.ts \
  apps/server/src/ai/agents/masterAgent/masterAgent.ts
git commit -m "feat: add json-render approval tool"
```

### Task 4: Add frontend JsonRenderTool UI and routing

**Files:**
- Create: `apps/web/src/components/chat/message/tools/JsonRenderTool.tsx`
- Modify: `apps/web/src/components/chat/message/tools/MessageTool.tsx`
- Modify: `apps/web/src/lib/chat/tool-name.ts`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

Create the tool renderer with JSONUIProvider and action handlers:

```tsx
// apps/web/src/components/chat/message/tools/JsonRenderTool.tsx
const actionHandlers = {
  submit: () => handleSubmit(),
  cancel: () => handleCancel(),
};
```

Submit with toolApprovalPayloads:

```ts
await chat.sendMessage(undefined, {
  body: { toolApprovalPayloads: { [toolCallId]: values } },
});
```

Route tool kind in MessageTool and add tool name mapping.

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add apps/web/src/components/chat/message/tools/JsonRenderTool.tsx \
  apps/web/src/components/chat/message/tools/MessageTool.tsx \
  apps/web/src/lib/chat/tool-name.ts
git commit -m "feat: render json-render tool and submit approval payloads"
```
