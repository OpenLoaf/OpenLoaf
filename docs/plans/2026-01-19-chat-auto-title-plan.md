# Chat Auto Title Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set the session title from the first user message (first 10 words/characters) and auto-refresh the title via AI every 5 assistant replies.

**Architecture:** Keep title generation in the server for the initial title (message store), and trigger AI-based refresh from the client after each assistant reply count reaches a multiple of 5 using the existing `chat.autoTitle` mutation. Refresh session lists on the client so titles update immediately.

**Tech Stack:** Hono, Prisma, tRPC, React, AI SDK.

**Note:** Project rule overrides TDD here. Skip test-first steps and use smoke verification steps instead. Do not create a worktree.

### Task 1: Apply initial-title rule in message storage

**Files:**
- Modify: `apps/server/src/ai/infrastructure/repositories/messageStore.ts`

**Step 1: Add title truncation helper**

Add constants and helper near the existing `MAX_SESSION_TITLE_CHARS` and `extractTitleTextFromParts`:

```ts
const INITIAL_TITLE_WORD_LIMIT = 10;
const INITIAL_TITLE_CHAR_LIMIT = 10;

/** Trim title to the first N words (whitespace) or N characters. */
function trimTitleByWordsOrChars(input: string): string {
  const normalized = input.replace(/\s+/gu, " ").trim();
  if (!normalized) return "";
  if (/\s/u.test(normalized)) {
    const words = normalized.split(/\s+/gu).filter(Boolean);
    return words.slice(0, INITIAL_TITLE_WORD_LIMIT).join(" ");
  }
  return Array.from(normalized).slice(0, INITIAL_TITLE_CHAR_LIMIT).join("");
}
```

**Step 2: Apply helper in `extractTitleTextFromParts`**

```ts
const raw = chunks.join("\n").trim();
return trimTitleByWordsOrChars(raw);
```

**Step 3: Commit**

```bash
git add apps/server/src/ai/infrastructure/repositories/messageStore.ts
git commit -m "feat(chat): derive initial title from first message"
```

### Task 2: Auto-refresh title every 5 assistant replies

**Files:**
- Modify: `apps/web/src/components/chat/ChatProvider.tsx`

**Step 1: Add refs and mutation**

Add refs for assistant reply counts and pending initial-title refresh, and add a `trpc.chat.autoTitle` mutation that invalidates session list on success.

**Step 2: Mark first user message for title refresh**

In `sendMessage`, detect the first user message (no prior user messages, not a command), and set a ref flag so `onFinish` can invalidate session list after the first assistant reply.

**Step 3: Trigger autoTitle every 5 assistant replies**

In `onFinish`, increment assistant reply count and call `autoTitle` when `count % 5 === 0`.

**Step 4: Commit**

```bash
git add apps/web/src/components/chat/ChatProvider.tsx
git commit -m "feat(chat): auto refresh title every five replies"
```

### Task 3: Verification

**Files:**
- Verify: `apps/server/src/ai/infrastructure/repositories/messageStore.ts`
- Verify: `apps/web/src/components/chat/ChatProvider.tsx`

**Step 1: Quick grep**

Run: `rg -n "autoTitle" apps/web/src/components/chat/ChatProvider.tsx`
Expected: mutation + onFinish trigger present

**Step 2: Optional type check**

Run: `pnpm check-types`
Expected: PASS (or fix any new type errors in touched files only)

**Step 3: Commit fixes (if any)**

```bash
git add apps/server/src/ai/infrastructure/repositories/messageStore.ts \
  apps/web/src/components/chat/ChatProvider.tsx
git commit -m "fix(chat): address auto title issues"
```
