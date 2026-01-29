# Video Generate Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `VideoGenerateNode` fully generate videos end-to-end (submit → poll → download → save → create VideoNode), aligned with `ImageGenerateNode` behavior.

**Architecture:** Frontend submits video generation via tRPC, polls server for Volcengine task status, server downloads the finished video into the project assets directory, and the board creates a connected `video` node from the saved file. Inputs are derived from board connectors (text/image/image_prompt_generate) and mapped to Volcengine’s supported parameters.

**Tech Stack:** React (apps/web), tRPC (packages/api + apps/server), Volcengine adapter (apps/server), board engine (apps/web/src/components/board).

> Note: Per project rule “Superpowers 规则”, skip TDD and do not create a worktree for this plan.

---

### Task 1: Add server-side video result polling + save helpers

**Files:**
- Create: `apps/server/src/ai/services/video/videoGeneration.ts`
- Create: `apps/server/src/ai/services/video/videoStorage.ts`

**Step 1: Implement Volcengine video result query**
- Add a helper to build `CVSync2AsyncGetResult` requests using `buildVolcengineRequest`.
- Parse response with the same error handling pattern used in `volcengineAdapter.ts` (code==10000 + status).
- Expose a function like `fetchVolcengineVideoResult({ taskId, providerConfig, modelId })` that returns `{ status, videoUrl }`.

**Step 2: Implement polling utility**
- Add a `waitForVolcengineVideoResult` that polls until `status === "done"` or terminal error.
- Use a bounded loop (e.g., 30–60 attempts, 1.5–2.5s interval) to avoid runaway requests.

**Step 3: Implement video save utilities**
- Add `resolveVideoSaveDirectory` analogous to `resolveImageSaveDirectory`, but allow video extensions (`.mp4`, `.webm`, `.mov`, `.mkv`) and directory inputs.
- Add `saveGeneratedVideoFromUrl({ url, directory, fileNameBase })`:
  - Fetch binary data from the provider `video_url`.
  - Determine extension from content-type or URL path; default to `.mp4`.
  - Write to a deterministic file name using taskId (e.g., `video-${taskId}.mp4`) to make saves idempotent.

**Step 4: Manual verification (no TDD)**
- Ensure helpers compile and are referenced by routers in Task 2.

---

### Task 2: Extend AI router contracts for video result + save

**Files:**
- Modify: `packages/api/src/routers/ai.ts`
- Modify: `apps/server/src/routers/ai.ts`

**Step 1: Add schema + router contract**
- Add `videoGenerateResult` to `aiSchemas` with input:
  - `taskId: string`
  - `workspaceId?: string`
  - `projectId?: string`
  - `saveDir?: string` (project-relative or scoped, same format as board assets)
- Output:
  - `status: "in_queue" | "generating" | "done" | "not_found" | "expired" | "failed"`
  - `videoUrl?: string`
  - `savedPath?: string`
  - `fileName?: string`
- Add the procedure to `BaseAiRouter.createRouter()`.

**Step 2: Implement server handler**
- In `AiRouterImpl`, implement `videoGenerateResult`:
  - Resolve Volcengine provider config via settings (same provider as submit).
  - Query result with `fetchVolcengineVideoResult`.
  - If status is `done` and `saveDir` provided, download & save video using `videoStorage`.
  - Return status + saved path + fileName.

**Step 3: Support local image inputs for video submit**
- In `videoGenerate` mutation, if `imageUrls` are project-relative/scoped:
  - Load buffers via `loadProjectImageBuffer`.
  - Populate `binaryDataBase64` and clear `imageUrls` for provider submission.

**Step 4: Manual verification (no TDD)**
- Ensure schema and router compile (typecheck).

---

### Task 3: Update VideoGenerateNode to match ImageGenerateNode flow

**Files:**
- Modify: `apps/web/src/components/board/nodes/VideoGenerateNode.tsx`
- Modify (if needed): `apps/web/src/components/board/render/webgpu/board-renderer.worker.ts`

**Step 1: Align node props with video generation params**
- Add `aspectRatio?: string`, `resultVideo?: string`, `errorText?: string`.
- Keep `durationSeconds` for UI; map to `frames` (121 for <=5s, 241 for >5s).

**Step 2: Build connector-derived inputs**
- Mirror `ImageGenerateNode` logic:
  - Collect input image nodes (`image` type), max 1.
  - Collect upstream text from `text` and `image_prompt_generate` nodes.
  - Merge upstream + local prompt.
  - Validate prompt or image presence.

**Step 3: Add save directory resolution**
- Use `resolveBoardFolderScope` and `BOARD_ASSETS_DIR_NAME` to compute `saveDir` for server.

**Step 4: Implement run + poll flow**
- On run:
  - Call `trpcClient.ai.videoGenerate.mutate()` with prompt/imageUrls/frames/aspectRatio.
  - Store taskId in ref.
  - Poll `trpcClient.ai.videoGenerateResult.query()` until `status === done` or error.
  - On `done`, build a `video` node from `savedPath` and connect it to the generator.
  - Update node props with `resultVideo` / `errorText`.

**Step 5: Create VideoNode output**
- Use `toBoardRelativePath` to store board-scoped `sourcePath`.
- Position output nodes to the right of generator (match ImageGenerateNode layout rules).
- Preserve selection and connector style.

**Step 6: UI status + hints**
- Update status labels/messages to reflect real run states (running / done / error / invalid input).
- Replace “暂未接入” copy with real guidance.

**Step 7: Manual verification (no TDD)**
- Start app, generate a video from text-only prompt.
- Generate with an input image connected.
- Verify saved file appears under board assets and a `video` node is created & playable.

---

### Task 4: Sanity checks + typecheck

**Files:**
- Modify as needed based on compile errors.

**Step 1: Run typecheck**
- Command: `pnpm check-types`
- Expected: no errors.

**Step 2: Spot-check UI**
- Ensure no console errors in browser.

---

Plan complete and saved to `docs/plans/2026-01-29-video-generate-flow.md`.

Two execution options:
1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
