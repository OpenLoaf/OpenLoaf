# Compact Context Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/compact` flow that generates a summary message, stores it with `messageKind`, and trims model context to the latest summary while keeping a session preface.

**Architecture:** Store `messageKind` on chat messages (normal/session_preface/compact_prompt/compact_summary). On `/compact`, the server replaces the user input with a `compact_prompt`, generates a `compact_summary`, and builds the model chain as `session_preface + latest compact_summary + following messages`, filtering `compact_prompt` except during the compaction request. The UI hides `session_preface` and `compact_prompt`, renders `compact_summary` as an expandable divider, and provides a leaf-only action to trigger `/compact`.

**Tech Stack:** Next.js (React), AI SDK (`@ai-sdk/react`), Hono server, tRPC, Prisma.

### Task 1: Add messageKind types and router filtering

**Files:**
- Modify: `packages/api/src/types/message.ts`
- Modify: `packages/api/src/routers/chat.ts`
- Create (test): `packages/api/src/types/__tests__/messageKind.test.ts`

**Step 1: Write the failing test**

```ts
import type { ChatMessageKind, TenasUIMessage } from "../message";

const kind: ChatMessageKind = "compact_summary";
const message: TenasUIMessage = {
  id: "1",
  role: "user",
  parts: [],
  parentMessageId: null,
  messageKind: kind,
};

void message;
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @tenas-ai/api check-types`  
Expected: FAIL with missing `ChatMessageKind` or `messageKind`.

**Step 3: Write minimal implementation**

```ts
export type ChatMessageKind =
  | "normal"
  | "session_preface"
  | "compact_prompt"
  | "compact_summary";

export interface TenasUIMessage extends UIMessage<unknown, TenasUIDataTypes, UITools> {
  /** Message kind for compaction/preface handling. */
  messageKind?: ChatMessageKind;
}
```

```ts
function isRenderableRow(row: { role: string; parts: unknown; messageKind?: ChatMessageKind | null }) {
  const kind = row.messageKind ?? "normal";
  if (kind === "session_preface" || kind === "compact_prompt") return false;
  if (kind === "compact_summary") return true;
  if (row.role === "user") return true;
  return Array.isArray(row.parts) && row.parts.length > 0;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @tenas-ai/api check-types`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/api/src/types/message.ts packages/api/src/routers/chat.ts packages/api/src/types/__tests__/messageKind.test.ts
git commit -m "feat(api): add message kind metadata"
```

### Task 2: Implement server compaction flow and chain trimming

**Files:**
- Modify: `packages/db/prisma/schema/chat.prisma`
- Modify: `apps/server/src/ai/chat-stream/messageStore.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamService.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamHelpers.ts`
- Modify: `apps/server/src/ai/chat-stream/streamOrchestrator.ts`
- Modify: `apps/server/src/ai/chat-stream/messageChainLoader.ts`

**Step 1: Write the failing test**

```ts
import { strict as assert } from "node:assert";
import { buildModelChainForTest } from "../chatStreamHelpers";

const chain = buildModelChainForTest([
  { role: "system", parts: [], messageKind: "session_preface" },
  { role: "user", parts: [{ type: "text", text: "hello" }] },
  { role: "assistant", parts: [{ type: "text", text: "hi" }] },
  { role: "assistant", parts: [{ type: "text", text: "summary" }], messageKind: "compact_summary" },
  { role: "user", parts: [{ type: "text", text: "next" }] },
]);

assert.equal(chain[0]?.messageKind, "session_preface");
assert.equal(chain[1]?.messageKind, "compact_summary");
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter server check-types`  
Expected: FAIL because `buildModelChainForTest` does not exist and `messageKind` is not persisted.

**Step 3: Write minimal implementation**

```prisma
enum MessageKind {
  normal
  session_preface
  compact_prompt
  compact_summary
}

model ChatMessage {
  messageKind MessageKind @default(normal)
}
```

```ts
function buildModelChain(messages: UIMessage[], options?: { includeCompactPrompt?: boolean }) {
  // keep session_preface, trim to latest compact_summary
}

export function buildModelChainForTest(messages: UIMessage[]) {
  return buildModelChain(messages);
}
```

```ts
if (isCompactCommand) {
  const compactPromptMessage = {
    id: lastMessage.id,
    role: "user",
    parentMessageId,
    messageKind: "compact_prompt",
    parts: [{ type: "text", text: buildCompactPromptText() }],
  };
}
```

```ts
if (input.assistantMessageKind) {
  responseMessage.messageKind = input.assistantMessageKind;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter server check-types`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/db/prisma/schema/chat.prisma apps/server/src/ai/chat-stream/*
git commit -m "feat(server): add compact message flow"
```

### Task 3: Add UI compaction trigger and summary divider

**Files:**
- Modify: `apps/web/src/components/chat/ChatInput.tsx`
- Modify: `apps/web/src/components/chat/ChatProvider.tsx`
- Modify: `apps/web/src/components/chat/message/MessageAiAction.tsx`
- Modify: `apps/web/src/components/chat/message/MessageItem.tsx`
- Create: `apps/web/src/components/chat/message/CompactSummaryDivider.tsx`

**Step 1: Write the failing test**

```ts
// apps/web/src/components/chat/message/__tests__/compact-summary.test.tsx
import { render } from "@testing-library/react";
import CompactSummaryDivider from "../CompactSummaryDivider";

render(<CompactSummaryDivider summary="summary" />);
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter web check-types`  
Expected: FAIL because the component does not exist.

**Step 3: Write minimal implementation**

```tsx
export default function CompactSummaryDivider({ summary }: { summary: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {open ? summary : "--- Context compressed ---"}
    </button>
  );
}
```

```tsx
if (textValue === "/compact") {
  sendMessage({ parts: [{ type: "text", text: "/compact" }], messageKind: "compact_prompt" });
}
```

```tsx
const canCompact = message.role === "assistant" && isLeafMessage;
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter web check-types`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/chat
git commit -m "feat(web): add compact summary UI"
```
