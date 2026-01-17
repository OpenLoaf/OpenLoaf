# Chat Context Compaction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add message kind markers to support session preface + compact prompt/summary, trim model inputs to the latest summary, and render a compact divider in the UI.

**Architecture:** Persist a `messageKind` enum on chat messages, write compaction artifacts as real messages, and construct LLM inputs from `session_preface + latest compact_summary + messages after summary`. UI hides compact prompts/preface, but shows a clickable summary divider.

**Tech Stack:** Prisma (SQLite), tRPC, Next.js (apps/web), AI SDK (apps/server).

### Task 1: Add messageKind to the data model and types

**Files:**
- Modify: `packages/db/prisma/schema/chat.prisma`
- Modify: `packages/api/src/types/message.ts`

**Step 1: Add MessageKind enum + field**

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

**Step 2: Extend TenasUIMessage types**

```ts
export type MessageKind = "normal" | "session_preface" | "compact_prompt" | "compact_summary";

export interface TenasUIMessage extends UIMessage<unknown, TenasUIDataTypes, UITools> {
  messageKind?: MessageKind;
}
```

**Step 3: Run migration**

Run: `pnpm db:migrate`  
Expected: Prisma migration succeeds and client is regenerated.

### Task 2: Persist messageKind and session preface

**Files:**
- Modify: `apps/server/src/ai/chat-stream/messageStore.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamService.ts`

**Step 1: Normalize + persist messageKind**

```ts
function normalizeMessageKind(value: unknown): MessageKind {
  if (value === "session_preface" || value === "compact_prompt" || value === "compact_summary") {
    return value;
  }
  return "normal";
}
```

**Step 2: Ensure session preface exists (once per session)**

Create a helper that:
- Checks if `messageKind=session_preface` exists
- If not, create a role=user message (parent null) with placeholder sections:
  - workspace/project identifiers
  - skills summary
  - selected skills list
  - AGENTS 链占位（以后再填）

**Step 3: Save the user last message after preface**

Ensure `saveLastMessageAndResolveParent` runs after preface creation.

### Task 3: Write compact prompt + summary records (two messages)

**Files:**
- Modify: `apps/server/src/ai/chat-stream/chatStreamService.ts`
- Modify: `apps/server/src/ai/chat-stream/messageStore.ts`

**Step 1: On compact trigger**
- Write a user message with `messageKind=compact_prompt`
- Parent: current leaf

**Step 2: Persist model summary**
- Write an assistant message with `messageKind=compact_summary`
- Parent: compact_prompt message

**Step 3: Keep both in history**
- UI can hide prompt but show summary divider

### Task 4: Trim model input to the latest compact summary

**Files:**
- Modify: `apps/server/src/ai/chat-stream/messageChainLoader.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamHelpers.ts`

**Step 1: Load full chain (include messageKind)**

**Step 2: Build model chain**
- Find the latest `compact_summary` in the branch
- If found: `session_preface + latest compact_summary + messages after it`
- If not found: `session_preface + full chain`

**Step 3: Replace relative file parts only for model chain**

Run: `pnpm --filter server check-types`  
Expected: no TS errors.

### Task 5: Filter UI history + render compact summary divider

**Files:**
- Modify: `packages/api/src/routers/chat.ts`
- Modify: `apps/server/src/routers/chat.ts`
- Modify: `apps/web/src/components/chat/message/MessageItem.tsx`
- Create: `apps/web/src/components/chat/message/CompactSummaryDivider.tsx`

**Step 1: Filter preface + compact_prompt in API**
- `session_preface` and `compact_prompt` are not returned in chat view
- `compact_summary` stays and exposes `messageKind`

**Step 2: Render divider in UI**
- Show `--- 上下文已压缩 ---`
- Click to expand summary text (use `getMessagePlainText`)

**Step 3: Hide actions for summary**
- No retry/edit/copy actions for the divider

### Task 6: Verification

**Step 1: Type check**
Run: `pnpm check-types`  
Expected: all types pass.

**Step 2: Manual UI check**
- Open a session containing a compact summary
- Confirm divider renders and expands
- Confirm hidden prompt/preface is not displayed
