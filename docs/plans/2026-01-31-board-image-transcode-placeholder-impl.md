# Board Image Transcode Placeholder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show image nodes immediately with a “transcoding” state for non-JPG/PNG inserts, then update the node with the converted PNG once ready.

**Architecture:** Keep image conversion in the client. On insert, create an ImageNode placeholder with `isTranscoding` and no preview, while registering a conversion task in `BoardCanvasCollab`. A watcher finds nodes with a `transcodingId`, runs conversion + asset save in the background, and updates node props (and size) when done. On failure, toast and fall back to original file.

**Tech Stack:** React/Next.js, TypeScript, sonner toast, board engine/doc updates, `heic2any` dynamic import.

---

> Note: Per project rules for superpowers workflows, skip TDD steps and do not create a worktree.

### Task 1: Add ImageNode transcoding props and UI

**Files:**
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`

**Step 1: Add optional props to schema and defaults**

```ts
isTranscoding: z.boolean().optional(),
transcodingLabel: z.string().optional(),
```

Default values:

```ts
isTranscoding: false,
transcodingLabel: "转码中",
```

**Step 2: Render overlay when transcoding**

Add overlay text when `isTranscoding` is true (use existing skeleton background).

### Task 2: Implement conversion task registry in BoardCanvasCollab

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasCollab.tsx`

**Step 1: Create pending conversion map**

Add `useRef<Map<string, { file: File; started: boolean }>>` and a `makeTranscodingId()` helper.

**Step 2: Build placeholder payload for non-JPG/PNG**

When file needs conversion:
- Register task in map.
- Return payload with `isTranscoding: true`, `transcodingId`, empty `previewSrc`, minimal size (use `DEFAULT_NODE_SIZE`).

**Step 3: Watch doc for nodes with transcodingId**

Use `useEffect` with engine/doc snapshot to:
- Find nodes with `isTranscoding` + `transcodingId`.
- Start conversion once (using map state), then:
  - Convert to PNG
  - Save to board asset
  - Build payload from converted file
  - Update node props + resize node (keep center)
- On failure: toast error, fall back to original file payload.

### Task 3: Wire placeholder payload into image insertion builder

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasCollab.tsx`

**Step 1: Use the placeholder path in `engine.setImagePayloadBuilder`**

Keep JPG/PNG path unchanged. For others, return placeholder payload immediately.

---

Plan complete and saved to `docs/plans/2026-01-31-board-image-transcode-placeholder-impl.md`.

Two execution options:
1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
