# Master Agent Skills & Prompt Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move MasterAgent system instructions into a Chinese markdown file and integrate skills summary/selection injection based on `params.skills`.

**Architecture:** MasterAgent builds its system prompt from a base markdown file plus dynamic runtime sections. Skills are loaded from workspace/project `.tenas/skills` directories by parsing YAML front matter only, and selected skills come from request params stored in request context.

**Tech Stack:** Node.js, TypeScript, Tenas server, AI SDK ToolLoopAgent

### Task 1: Add base prompt markdown

**Files:**
- Create: `apps/server/src/ai/agents/masterAgent/masterAgentPrompt.zh.md`

**Step 1: Write the markdown content**

```markdown
(Chinese system prompt based on codex gpt_5_2_prompt.md structure)
```

**Step 2: Skip tests (user approved)**

No automated tests for markdown-only change.

### Task 2: Implement skills loader (front matter only)

**Files:**
- Create: `apps/server/src/ai/agents/masterAgent/skillsLoader.ts`

**Step 1: Write the failing test**

Skipped (user approved).

**Step 2: Run test to verify it fails**

Skipped (user approved).

**Step 3: Write minimal implementation**

```ts
// Load SKILL.md files from workspace/project and parse YAML front matter name/description.
```

**Step 4: Run test to verify it passes**

Skipped (user approved).

**Step 5: Commit**

Skipped (not requested).

### Task 3: Plumb selected skills into request context

**Files:**
- Modify: `apps/server/src/ai/chat-stream/chatStreamService.ts`
- Modify: `apps/server/src/ai/chat-stream/chatStreamHelpers.ts`
- Modify: `apps/server/src/ai/chat-stream/requestContext.ts`

**Step 1: Write the failing test**

Skipped (user approved).

**Step 2: Run test to verify it fails**

Skipped (user approved).

**Step 3: Write minimal implementation**

```ts
// Parse params.skills -> store in request context for prompt builder.
```

**Step 4: Run test to verify it passes**

Skipped (user approved).

**Step 5: Commit**

Skipped (not requested).

### Task 4: Update MasterAgent prompt builder

**Files:**
- Modify: `apps/server/src/ai/agents/masterAgent/masterAgent.ts`

**Step 1: Write the failing test**

Skipped (user approved).

**Step 2: Run test to verify it fails**

Skipped (user approved).

**Step 3: Write minimal implementation**

```ts
// Read base prompt markdown + append dynamic sections (env/rules/skills/selection).
```

**Step 4: Run test to verify it passes**

Skipped (user approved).

**Step 5: Commit**

Skipped (not requested).
