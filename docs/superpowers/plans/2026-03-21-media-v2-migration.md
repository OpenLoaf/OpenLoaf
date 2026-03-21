# Media v2 API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate OpenLoaf's media generation system from SDK v1 (3 separate endpoints) to SDK v2 (unified `/ai/media/generate` endpoint with feature-based discriminated union), redesigning all three AI panels (Image, Video, Audio) to match the new 8-feature architecture.

**Architecture:** SDK v2 uses a single POST `/api/ai/media/generate` endpoint with a `feature` discriminated union field (8 features: imageGenerate, poster, imageEdit, upscale, outpaint, videoGenerate, digitalHuman, tts). The server proxies requests to SaaS via `@openloaf-saas/sdk` v0.1.12's `AiClient.mediaGenerate()`. Frontend panels remove `modelId` selection and adopt feature+mode navigation. V1 routes are preserved for backward compat but marked deprecated.

**Tech Stack:** TypeScript, React 19, Hono (server), tRPC, @openloaf-saas/sdk v0.1.12 (Zod schemas), Tailwind CSS 4, i18next

---

## File Structure

### Types Layer
- **Modify:** `packages/api/src/types/saasMedia.ts` — Add v2 type re-exports from SDK
- **Modify:** `apps/web/src/components/board/board-contracts.ts:55-76` — Update AiGenerateConfig

### Server Layer
- **Modify:** `apps/server/src/modules/saas/modules/media/client.ts` — Add v2 SDK client functions
- **Modify:** `apps/server/src/modules/saas/modules/media/mediaProxy.ts` — Add v2 proxy functions, extend resolvePayloadMediaInputs
- **Modify:** `apps/server/src/modules/saas/modules/media/mediaTaskStore.ts:14-27` — Extend MediaTaskContext
- **Modify:** `apps/server/src/ai/interface/routes/saasMediaRoutes.ts:120-189` — Add v2 routes

### Frontend HTTP Client
- **Modify:** `apps/web/src/lib/saas-media.ts` — Add v2 fetch functions

### Frontend Services
- **Modify:** `apps/web/src/components/board/services/image-generate.ts` — Switch to submitMediaGenerate
- **Modify:** `apps/web/src/components/board/services/upscale-generate.ts` — Switch to submitMediaGenerate
- **Modify:** `apps/web/src/components/board/services/audio-generate.ts` — Switch to submitMediaGenerate
- **Modify:** `apps/web/src/components/board/services/credit-estimate.ts` — Feature-based estimation
- **Create:** `apps/web/src/components/board/services/video-generate.ts` (if missing, verify)

### Frontend Panels
- **Modify:** `apps/web/src/components/board/panels/ImageAiPanel.tsx` — 5-feature tab redesign
- **Modify:** `apps/web/src/components/board/panels/VideoAiPanel.tsx` — 2-level navigation redesign
- **Modify:** `apps/web/src/components/board/panels/AudioAiPanel.tsx` — TTS-centric redesign

### Config & i18n
- **Modify:** `apps/web/src/components/board/nodes/node-config.ts` — Update aspect ratio/duration options
- **Modify:** `apps/web/src/i18n/locales/zh-CN/board.json` — New i18n keys
- **Modify:** `apps/web/src/i18n/locales/en-US/board.json` — New i18n keys
- **Modify:** `apps/web/src/i18n/locales/zh-TW/board.json` — New i18n keys

### Polling
- **Modify:** `apps/web/src/components/board/hooks/useMediaTaskPolling.ts` — Support TaskGroup

---

## Phase 1: Foundation (Types + Server + Frontend HTTP)

### Task 1: Types Layer — Add v2 Re-exports

**Files:**
- Modify: `packages/api/src/types/saasMedia.ts`

- [ ] **Step 1: Add v2 type imports and re-exports**

After the existing v1 re-exports (line 40), add v2 type re-exports from SDK:

```typescript
// ── Media v2 types ──
export type {
  MediaFeature,
  MediaAspectRatio,
  MediaResolution,
  MediaQuality,
  MediaGenerateBase,
  MediaGenerateRequest,
  ImageGenerateRequest as MediaImageGenerateRequest,
  PosterRequest,
  ImageEditRequest,
  UpscaleRequest as MediaUpscaleRequest,
  OutpaintRequest,
  VideoGenerateRequest as MediaVideoGenerateRequest,
  DigitalHumanRequest,
  TtsRequest,
  MediaTaskItem,
  MediaTaskGroupData,
  MediaTaskGroupSuccess,
  MediaTaskGroupResponse,
  MediaModelsQuery,
} from "@openloaf-saas/sdk";

// ── Media v2 payload ──
export type SaasMediaGeneratePayload = import("@openloaf-saas/sdk").MediaGenerateRequest & MediaSubmitContext;
```

Note: Use `as` aliases for `ImageGenerateRequest` and `UpscaleRequest` to avoid conflicts with service-layer local types.

- [ ] **Step 2: Run type check**

Run: `pnpm run check-types`
Expected: All packages pass type checking.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/types/saasMedia.ts
git commit -m "feat(api): add SDK v2 media type re-exports"
```

### Task 2: Update AiGenerateConfig

**Files:**
- Modify: `apps/web/src/components/board/board-contracts.ts:55-76`

- [ ] **Step 1: Add feature field, deprecate modelId**

Update AiGenerateConfig (line 55-76):

```typescript
/** AI generation configuration stored on nodes created by AI. */
export type AiGenerateConfig = {
  /** SDK v2 feature that produced this generation. */
  feature?: 'imageGenerate' | 'poster' | 'imageEdit' | 'upscale' | 'outpaint' | 'videoGenerate' | 'digitalHuman' | 'tts'
  /** @deprecated v2 uses feature-based routing. Kept for backward compat. */
  modelId?: string
  /** Text prompt used for generation. */
  prompt: string
  /** Negative prompt (optional). */
  negativePrompt?: string
  /** Style preset applied during generation. */
  style?: string
  /** Aspect ratio used for generation. */
  aspectRatio?: 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2'
  /** Generation quality level. */
  quality?: 'draft' | 'standard' | 'hd'
  /** Number of results generated. */
  count?: number
  /** Seed for reproducibility. */
  seed?: number
  /** Upstream node ids used as input references. */
  inputNodeIds?: string[]
  /** Server-side task id for the generation job. */
  taskId?: string
  /** Timestamp when the generation completed. */
  generatedAt?: number
  /** Generated result URLs (when count > 1). */
  results?: Array<{ previewSrc: string; originalSrc: string }>
  /** Currently selected result index. */
  selectedIndex?: number
}
```

Key changes: `feature` field added, `modelId` made optional with @deprecated, `quality`/`count`/`seed` added, `aspectRatio` union extended with `'3:2'`.

- [ ] **Step 2: Run type check**

Run: `pnpm run check-types`
Expected: Pass. `modelId` was already used as `string` so making it optional is backward-compatible. Check for any code that destructures `modelId` as required.

- [ ] **Step 3: Fix type errors from modelId optionality**

Since `modelId` is now optional, any code that writes `{ modelId, prompt, ... }` as AiGenerateConfig will still compile (optional fields can be provided). But any code that reads `aiConfig.modelId` as required will fail. Apply these fixes:

1. `ImageAiPanel.tsx:274` — `modelId` in the config literal: no change needed (still valid to provide optional field)
2. `ImageAiPanel.tsx:209` — `aiConfig?.modelId ?? 'auto'`: no change needed (already uses `??`)
3. `VideoAiPanel.tsx:139` — `modelId` in the config literal: no change needed
4. `ImageNode.tsx` — any `params.modelId` usage: add `?? ''` fallback where destructured
5. `VideoNode.tsx` — same treatment
6. `AudioNode.tsx` — same treatment

Run `pnpm run check-types` and fix each error by adding `?? ''` or `?? 'auto'` to `modelId` reads. These files will be fully refactored in Phase 2-4, so minimal fixes here.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/board-contracts.ts
git commit -m "feat(board): add feature field to AiGenerateConfig, deprecate modelId"
```

### Task 3: Update Node Config Options

**Files:**
- Modify: `apps/web/src/components/board/nodes/node-config.ts`

- [ ] **Step 1: Extend aspect ratio and duration options to match SDK v2**

Update line 39 (add `3:2` to match SDK v2's `mediaAspectRatioSchema`):
```typescript
const GENERATE_ASPECT_RATIO_OPTIONS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:2"] as const;
```

Also remove `'3:4'` from `AiGenerateConfig.aspectRatio` in Task 2 if it's not in SDK v2 (SDK v2 has: 1:1, 16:9, 9:16, 4:3, 3:2 — no 3:4).

Update line 82:
```typescript
export const VIDEO_GENERATE_DURATION_OPTIONS = [5, 10, 15] as const;
```

- [ ] **Step 2: Run type check**

Run: `pnpm run check-types`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/nodes/node-config.ts
git commit -m "feat(board): extend aspect ratio and duration options for SDK v2"
```

### Task 4: Server — Add v2 Client Functions

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/client.ts`

- [ ] **Step 1: Add v2 import and SDK type**

At top of file (after line 10 import), add:
```typescript
import type { MediaGenerateRequest, MediaFeature } from "@openloaf-saas/sdk";
```

- [ ] **Step 2: Add submitMediaGenerateV2 function**

After `cancelMediaTask()` (line 117), add:

```typescript
/** Submit a media generation task via SDK v2 unified endpoint. */
export async function submitMediaGenerateV2(
  payload: MediaGenerateRequest,
  accessToken: string,
): Promise<{ success: boolean; data?: { taskId: string }; message?: string }> {
  const client = getSaasClient(accessToken);
  return client.ai.mediaGenerate(payload) as any;
}
```

- [ ] **Step 3: Add pollMediaTaskV2 and cancelMediaTaskV2 functions**

```typescript
/** Poll single task via SDK v2 endpoint. */
export async function pollMediaTaskV2(
  taskId: string,
  accessToken: string,
): Promise<Omit<SaasMediaTaskResult, "taskId"> & { taskId?: string }> {
  const client = getSaasClient(accessToken);
  const response = (await client.ai.mediaTask(taskId)) as any;
  if (!response || response.success === false) {
    return { status: "not_found" };
  }
  const d = response.data;
  return {
    taskId,
    status: d.status ?? "queued",
    progress: d.progress,
    resultType: d.resultType,
    resultUrls: d.resultUrls,
    error: d.error,
    creditsConsumed: d.creditsConsumed,
  };
}

/** Cancel a running task via SDK v2. */
export async function cancelMediaTaskV2(
  taskId: string,
  accessToken: string,
): Promise<{ status: string }> {
  const client = getSaasClient(accessToken);
  const response = (await client.ai.mediaCancelTask(taskId)) as any;
  return { status: response?.data?.status ?? "unknown" };
}
```

- [ ] **Step 4: Add pollMediaTaskGroupV2 function**

```typescript
/** Poll task group via SDK v2. */
export async function pollMediaTaskGroupV2(
  groupId: string,
  accessToken: string,
): Promise<any> {
  const client = getSaasClient(accessToken);
  return client.ai.mediaTaskGroup(groupId);
}
```

- [ ] **Step 5: Add fetchMediaModelsV2 function**

```typescript
/** Fetch media models via SDK v2 unified endpoint. */
export async function fetchMediaModelsV2(
  accessToken: string,
  feature?: string,
): Promise<any> {
  const client = getSaasClient(accessToken);
  return client.ai.mediaModels(feature);
}
```

- [ ] **Step 6: Run type check**

Run: `pnpm run check-types`
Expected: Pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/saas/modules/media/client.ts
git commit -m "feat(server): add v2 media SDK client functions"
```

### Task 5: Server — Extend mediaTaskStore

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/mediaTaskStore.ts:14-27`

- [ ] **Step 1: Add feature and groupId to MediaTaskContext**

Update the type definition (line 14-27):

```typescript
export type MediaTaskContext = {
  taskId: string;
  /** v2: group this task belongs to. */
  groupId?: string;
  /** v2: feature discriminator. */
  feature?: string;
  resultType?: "image" | "video" | "audio";
  projectId?: string;
  saveDir?: string;
  sourceNodeId?: string;
  createdAt: number;
};
```

- [ ] **Step 2: Run type check**

Run: `pnpm run check-types`
Expected: Pass (new fields are optional).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/modules/saas/modules/media/mediaTaskStore.ts
git commit -m "feat(server): extend MediaTaskContext with feature and groupId"
```

### Task 6: Server — Add v2 Proxy Functions

**Files:**
- Modify: `apps/server/src/modules/saas/modules/media/mediaProxy.ts`

- [ ] **Step 1: Add v2 imports**

At the import section (line 10-35), add:

```typescript
import { submitMediaGenerateV2, pollMediaTaskV2, cancelMediaTaskV2, pollMediaTaskGroupV2, fetchMediaModelsV2 } from "./client";
import type { MediaFeature } from "@openloaf-saas/sdk";
```

- [ ] **Step 2: Add inferResultType helper**

After `resolvePayloadMediaInputs()` (after line 240):

```typescript
/** Infer resultType from v2 feature for storage routing. */
function inferResultType(feature: string): "image" | "video" | "audio" {
  switch (feature) {
    case "imageGenerate":
    case "poster":
    case "imageEdit":
    case "upscale":
    case "outpaint":
      return "image";
    case "videoGenerate":
    case "digitalHuman":
      return "video";
    case "tts":
      return "audio";
    default:
      return "image";
  }
}
```

- [ ] **Step 3: Add submitMediaGenerateProxy**

```typescript
/** Submit media generate via v2 unified endpoint. */
export async function submitMediaGenerateProxy(
  body: unknown,
  accessToken: string,
): Promise<unknown> {
  const { payload, context } = splitMediaSubmitBody(body);
  if (!payload || typeof payload !== "object" || !("feature" in payload)) {
    throw new MediaProxyHttpError(
      400,
      "invalid_payload",
      "请求参数无效，缺少 feature 字段",
    );
  }

  const feature = (payload as Record<string, unknown>).feature as string;
  const resolvedPayload = await resolvePayloadMediaInputs(payload, context);
  const result = await submitMediaGenerateV2(
    resolvedPayload as any,
    accessToken,
  );

  if (result?.success === true && result.data?.taskId) {
    rememberMediaTask({
      taskId: result.data.taskId,
      feature,
      resultType: inferResultType(feature),
      projectId: context.projectId,
      saveDir: context.saveDir,
      sourceNodeId: context.sourceNodeId,
      createdAt: Date.now(),
    });
  }

  return result;
}
```

- [ ] **Step 4: Add fetchMediaModelsProxy**

```typescript
/** Fetch v2 media models (unified, with optional feature filter). */
export async function fetchMediaModelsProxy(
  accessToken: string,
  feature?: string,
): Promise<unknown> {
  return fetchMediaModelsV2(accessToken, feature);
}
```

- [ ] **Step 5: Extend resolvePayloadMediaInputs for v2 input fields**

In `resolvePayloadMediaInputs()` (around line 198-240), make two changes:

**Change A:** BEFORE the `if (!inputs) return payload` guard (line 203), add top-level field resolution for TTS referenceAudio:

```typescript
// v2: referenceAudio (tts voice cloning) — at payload level, not inside inputs
let topLevelChanged = false;
if (isRecord(payload.referenceAudio) && typeof (payload.referenceAudio as any).url === "string") {
  const resolved = await resolveLocalMediaInput(payload.referenceAudio as Record<string, unknown>, context);
  if (resolved !== payload.referenceAudio) {
    payload = { ...payload, referenceAudio: resolved };
    topLevelChanged = true;
  }
}
```

And update the early return to: `if (!inputs) return topLevelChanged ? payload : payload;` (or just remove early return guard since we may have modified payload).

**Change B:** After the existing `inputs.referenceVideo` processing (line 236), add v2-specific input fields:

```typescript
// v2: single image input (imageEdit, upscale, outpaint)
if (isRecord(inputs.image) && typeof inputs.image.url === "string") {
  const resolved = await resolveLocalMediaInput(inputs.image as Record<string, unknown>, context);
  if (resolved !== inputs.image) { inputs.image = resolved; changed = true; }
}
// v2: mask input (imageEdit inpaint/erase)
if (isRecord(inputs.mask) && typeof inputs.mask.url === "string") {
  const resolved = await resolveLocalMediaInput(inputs.mask as Record<string, unknown>, context);
  if (resolved !== inputs.mask) { inputs.mask = resolved; changed = true; }
}
// v2: person input (digitalHuman)
if (isRecord(inputs.person) && typeof inputs.person.url === "string") {
  const resolved = await resolveLocalMediaInput(inputs.person as Record<string, unknown>, context);
  if (resolved !== inputs.person) { inputs.person = resolved; changed = true; }
}
// v2: audio input (digitalHuman)
if (isRecord(inputs.audio) && typeof inputs.audio.url === "string") {
  const resolved = await resolveLocalMediaInput(inputs.audio as Record<string, unknown>, context);
  if (resolved !== inputs.audio) { inputs.audio = resolved; changed = true; }
}
```

- [ ] **Step 6: Run type check**

Run: `pnpm run check-types`
Expected: Pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/saas/modules/media/mediaProxy.ts
git commit -m "feat(server): add v2 media proxy functions and extend input resolution"
```

### Task 7: Server — Register v2 Routes

**Files:**
- Modify: `apps/server/src/ai/interface/routes/saasMediaRoutes.ts:120-189`

- [ ] **Step 1: Import v2 proxy functions**

Add to imports (line 10-24):
```typescript
import { submitMediaGenerateProxy, fetchMediaModelsProxy, pollMediaProxy, cancelMediaProxy } from "../../../modules/saas/modules/media/mediaProxy";
```

Note: `pollMediaProxy` and `cancelMediaProxy` are already imported for v1 routes. If they are accessed via `deps`, check `SaasMediaRouteDeps` — the v2 routes should use the same pattern as v1. If v1 routes use `deps.pollMediaProxy`, add `pollMediaProxy` and `cancelMediaProxy` to `SaasMediaRouteDeps`. If v1 routes import them directly, use direct imports for v2 too.

- [ ] **Step 2: Add v2 routes inside registerSaasMediaRoutes**

After the existing v1 routes (before the closing `}` of `registerSaasMediaRoutes`), add:

```typescript
  // ═══════════ Media v2 routes ═══════════

  app.post("/ai/media/generate", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const body = await c.req.json().catch(() => null);
      return submitMediaGenerateProxy(body, accessToken);
    });
  });

  app.get("/ai/media/task/:taskId", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      const projectId = c.req.query("projectId") || undefined;
      const saveDir = c.req.query("saveDir") || undefined;
      // Reuse v1 poll logic — v2 task response is compatible
      return pollMediaProxy(c.req.param("taskId"), accessToken, { projectId, saveDir });
    });
  });

  app.post("/ai/media/task/:taskId/cancel", async (c) => {
    return handleSaasMediaRoute(c, async (accessToken) => {
      return cancelMediaProxy(c.req.param("taskId"), accessToken);
    });
  });

  app.get("/ai/media/models", async (c) => {
    const feature = c.req.query("feature") || undefined;
    return handleSaasMediaRoute(
      c,
      async (accessToken) => fetchMediaModelsProxy(accessToken, feature),
      { allowAnonymous: true },
    );
  });
```

- [ ] **Step 3: Run type check**

Run: `pnpm run check-types`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/ai/interface/routes/saasMediaRoutes.ts
git commit -m "feat(server): register v2 media routes"
```

### Task 8: Frontend — Add v2 HTTP Client Functions

**Files:**
- Modify: `apps/web/src/lib/saas-media.ts`

- [ ] **Step 1: Add v2 type import**

At top imports (after line 11):
```typescript
import type { MediaFeature } from "@openloaf/api/types/saasMedia";
```

- [ ] **Step 2: Add submitMediaGenerate function**

After the existing `submitVideoTask()` (after line 83):

```typescript
/** Submit a media generation task via v2 unified endpoint. */
export async function submitMediaGenerate(payload: Record<string, unknown>) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const response = await fetch(`${base}/ai/media/generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(response);
}
```

- [ ] **Step 3: Add pollMediaTask (v2) function**

```typescript
/** Poll single task via v2 endpoint. */
export async function pollMediaTaskV2(taskId: string, options?: PollTaskOptions) {
  const base = resolveServerUrl();
  const authHeaders = await buildAuthHeaders();
  const url = new URL(`${base}/ai/media/task/${taskId}`);
  if (options?.projectId) url.searchParams.set("projectId", options.projectId);
  if (options?.saveDir) url.searchParams.set("saveDir", options.saveDir);
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}
```

- [ ] **Step 4: Add fetchMediaModels (v2) function**

```typescript
/** Fetch media models via v2 unified endpoint. */
export async function fetchMediaModels(feature?: string, options?: FetchMediaModelsOptions) {
  const authHeaders = await buildAuthHeaders();
  const base = resolveServerUrl();
  const url = new URL(`${base}/ai/media/models`);
  if (feature) url.searchParams.set("feature", feature);
  if (options?.force) url.searchParams.set("force", "1");
  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: authHeaders,
  });
  return parseJsonResponse(response);
}
```

- [ ] **Step 5: Run type check**

Run: `pnpm run check-types`
Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/saas-media.ts
git commit -m "feat(web): add v2 media HTTP client functions"
```

---

## Phase 2: Image Panel & Services

### Task 9: Image Service — Switch to v2

**Files:**
- Modify: `apps/web/src/components/board/services/image-generate.ts`

- [ ] **Step 1: Replace submitImageTask with submitMediaGenerate**

Replace import (line 10):
```typescript
import { submitMediaGenerate } from '@/lib/saas-media'
```

- [ ] **Step 2: Update ImageGenerateRequest type**

Replace the existing type (line 20-30) with:

```typescript
export type ImageGenerateRequest = {
  prompt: string
  negativePrompt?: string
  aspectRatio?: string
  resolution?: string
  style?: string
  /** imageGenerate sub-mode. */
  mode?: 'text' | 'reference' | 'sketch' | 'character'
  /** Reference images for reference/sketch/character modes. */
  referenceImageSrcs?: string[]
  /** Whether input is a sketch (for sketch mode). */
  isSketch?: boolean
  /** Number of results to generate. */
  count?: 1 | 2 | 4
  /** Quality level. */
  quality?: 'draft' | 'standard' | 'hd'
  /** Seed for reproducibility. */
  seed?: number
}
```

- [ ] **Step 3: Rewrite submitImageGenerate to build v2 payload**

```typescript
export async function submitImageGenerate(
  request: ImageGenerateRequest,
  options: {
    projectId?: string
    saveDir?: string
    sourceNodeId?: string
  } = {},
): Promise<ImageGenerateResult> {
  const refSrcs = request.referenceImageSrcs?.length
    ? request.referenceImageSrcs
    : []

  const mode = request.mode
    ?? (refSrcs.length > 0 ? 'reference' : 'text')

  const payload: Record<string, unknown> = {
    feature: 'imageGenerate',
    prompt: request.prompt,
    negativePrompt: request.negativePrompt || undefined,
    aspectRatio: request.aspectRatio && request.aspectRatio !== 'auto'
      ? request.aspectRatio : undefined,
    resolution: request.resolution && request.resolution !== '1K'
      ? request.resolution : undefined,
    mode,
    style: request.style || undefined,
    count: request.count,
    quality: request.quality,
    seed: request.seed,
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  if (refSrcs.length > 0) {
    payload.inputs = {
      images: refSrcs.map((url) => ({ url })),
      isSketch: request.isSketch || undefined,
    }
  }

  const result = await submitMediaGenerate(payload)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || '图片生成任务创建失败'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
```

- [ ] **Step 4: Run type check**

Run: `pnpm run check-types`
Expected: May have errors in ImageNode.tsx or ImageAiPanel.tsx due to `modelId` removal from ImageGenerateRequest. Note these for Phase 2 panel refactor.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/services/image-generate.ts
git commit -m "feat(board): switch image-generate service to v2 unified endpoint"
```

### Task 10: Upscale Service — Switch to v2

**Files:**
- Modify: `apps/web/src/components/board/services/upscale-generate.ts`

- [ ] **Step 1: Rewrite to use submitMediaGenerate**

Replace the entire file content:

```typescript
import { submitMediaGenerate } from '@/lib/saas-media'

export type UpscaleRequest = {
  sourceImageSrc: string
  scale: 2 | 4
}

export type UpscaleResult = {
  taskId: string
}

/**
 * Submit an upscale task via v2 unified endpoint.
 * SDK v2 has native upscale support as a first-class feature.
 */
export async function submitUpscale(
  request: UpscaleRequest,
  options: { projectId?: string; saveDir?: string; sourceNodeId?: string } = {},
): Promise<UpscaleResult> {
  const payload: Record<string, unknown> = {
    feature: 'upscale',
    scale: request.scale,
    inputs: {
      image: { url: request.sourceImageSrc },
    },
    projectId: options.projectId,
    saveDir: options.saveDir,
    sourceNodeId: options.sourceNodeId,
  }

  const result = await submitMediaGenerate(payload)

  if (!result || result.success !== true || !result.data?.taskId) {
    const message = result?.message || 'Upscale task submission failed'
    throw new Error(message)
  }

  return { taskId: result.data.taskId as string }
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm run check-types`
Expected: Pass. The UpscaleRequest type changed (removed `modelId`, made `scale` a union).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/services/upscale-generate.ts
git commit -m "feat(board): switch upscale service to v2 native endpoint"
```

### Task 11: ImageAiPanel — Type & State Refactor

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx`

This is a large task. The panel needs to change from mode-based (auto/upscale/inpaint/erase) to feature-based (imageGenerate/poster/imageEdit/upscale/outpaint).

- [ ] **Step 1: Update types and constants**

Replace `ImagePanelMode`, `IMAGE_MODES`, `GenerateMode`, `FALLBACK_MODEL_OPTIONS`, and `ImageGenerateParams` at the top of the file:

```typescript
/** SDK v2 image feature. */
type ImageFeature = 'imageGenerate' | 'poster' | 'imageEdit' | 'upscale' | 'outpaint'

/** imageGenerate sub-mode. */
type ImageGenerateMode = 'text' | 'reference' | 'sketch' | 'character'

/** imageEdit sub-mode. */
type ImageEditMode = 'instruct' | 'stylize' | 'colorize' | 'inpaint' | 'erase' | 'eraseWatermark'

/** All image feature tabs. */
const FEATURE_TABS: Array<{ id: ImageFeature; needsImage: boolean }> = [
  { id: 'imageGenerate', needsImage: false },
  { id: 'poster', needsImage: false },
  { id: 'imageEdit', needsImage: true },
  { id: 'upscale', needsImage: true },
  { id: 'outpaint', needsImage: true },
]

/** Parameters passed to the onGenerate callback. */
export type ImageGenerateParams = {
  feature: ImageFeature
  prompt?: string
  negativePrompt?: string
  style?: string
  aspectRatio?: string
  resolution?: string
  count?: 1 | 2 | 4
  quality?: 'draft' | 'standard' | 'hd'
  seed?: number
  // imageGenerate
  generateMode?: ImageGenerateMode
  inputImages?: string[]
  isSketch?: boolean
  // poster
  posterTitle?: string
  posterSubTitle?: string
  posterBodyText?: string
  // imageEdit
  editMode?: ImageEditMode
  sourceImage?: string
  maskImage?: string
  strength?: number
  // upscale
  upscaleScale?: 2 | 4
  // outpaint
  outpaintDirection?: { top: number; bottom: number; left: number; right: number }
}
```

- [ ] **Step 2: Update component state variables**

Replace the state section. Remove `modelId`, `panelMode`. Add `feature`, `generateMode`, `editMode`, etc.:

```typescript
const [feature, setFeatureRaw] = useState<ImageFeature>('imageGenerate')
const [generateMode, setGenerateMode] = useState<ImageGenerateMode>('text')
const [editMode, setEditModeRaw] = useState<ImageEditMode>('instruct')
const [prompt, setPrompt] = useState(aiConfig?.prompt ?? upstreamText ?? '')
const [aspectRatio, setAspectRatio] = useState<AiGenerateConfig['aspectRatio']>(
  aiConfig?.aspectRatio ?? 'auto',
)
const [resolution, setResolution] = useState<(typeof GENERATE_RESOLUTION_OPTIONS)[number]>('1K')
const [showAdvanced, setShowAdvanced] = useState(false)
const [isGenerating, setIsGenerating] = useState(false)
const [generateCount, setGenerateCount] = useState<1 | 2 | 4>(1)
const [showCountDropdown, setShowCountDropdown] = useState(false)
const [upscaleScale, setUpscaleScale] = useState<2 | 4>(2)
const [quality, setQuality] = useState<'draft' | 'standard' | 'hd'>('standard')
const [seed, setSeed] = useState<string>('')
const [strength, setStrength] = useState(0.75)
// poster fields
const [posterTitle, setPosterTitle] = useState('')
const [posterSubTitle, setPosterSubTitle] = useState('')
const [posterBodyText, setPosterBodyText] = useState('')
// outpaint
const [outpaintDir, setOutpaintDir] = useState({ top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 })
```

Feature setter with mask toggle logic:
```typescript
const setFeature = useCallback((f: ImageFeature) => {
  setFeatureRaw(f)
  const needsMask = f === 'imageEdit' && (editMode === 'inpaint' || editMode === 'erase')
  onToggleMaskPaint?.(needsMask)
}, [editMode, onToggleMaskPaint])

const setEditMode = useCallback((m: ImageEditMode) => {
  setEditModeRaw(m)
  const needsMask = m === 'inpaint' || m === 'erase'
  onToggleMaskPaint?.(needsMask)
}, [onToggleMaskPaint])
```

- [ ] **Step 3: Remove model-related code**

Remove these:
- `useMediaModels()` hook call and `imageModels` destructure
- `filterImageMediaModels` import and `filteredModels` useMemo
- `modelId` state
- `FALLBACK_MODEL_OPTIONS` constant
- Model selector `<select>` in the parameter bar
- `estimateImageCredits` call that depends on `modelId`

- [ ] **Step 4: Update buildParams to use feature-based output**

```typescript
const buildParams = useCallback((): ImageGenerateParams => {
  const hasRefImages = (upstreamImages?.length ?? 0) > 0
  const base: ImageGenerateParams = {
    feature,
    prompt,
    negativePrompt: undefined,
    style: undefined,
    count: generateCount,
    quality,
    seed: seed ? Number(seed) : undefined,
  }

  switch (feature) {
    case 'imageGenerate':
      return {
        ...base,
        aspectRatio: aspectRatio ?? '1:1',
        resolution,
        generateMode: hasRefImages ? 'reference' : generateMode,
        inputImages: hasRefImages ? upstreamImages : undefined,
      }
    case 'poster':
      return {
        ...base,
        aspectRatio: aspectRatio ?? '1:1',
        posterTitle,
        posterSubTitle,
        posterBodyText,
      }
    case 'imageEdit':
      return {
        ...base,
        editMode,
        sourceImage: resolvedImageSrc,
        strength,
      }
    case 'upscale':
      return { ...base, upscaleScale }
    case 'outpaint':
      return {
        ...base,
        sourceImage: resolvedImageSrc,
        outpaintDirection: outpaintDir,
      }
    default:
      return base
  }
}, [feature, prompt, generateCount, quality, seed, aspectRatio, resolution,
    generateMode, upstreamImages, posterTitle, posterSubTitle, posterBodyText,
    editMode, resolvedImageSrc, strength, upscaleScale, outpaintDir])
```

- [ ] **Step 5: Update render — Feature Tabs**

Replace the mode tabs section with feature tabs:

```tsx
{/* ── Feature Tabs ── */}
<div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-ol-surface-muted p-0.5">
  {FEATURE_TABS.map((tab) => {
    const disabled = readonly || (tab.needsImage && !hasResource)
    return (
      <button
        key={tab.id}
        type="button"
        disabled={disabled}
        className={[
          'relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
          disabled
            ? 'cursor-not-allowed text-muted-foreground/40'
            : feature === tab.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
        onClick={() => !disabled && setFeature(tab.id)}
        title={tab.needsImage && !hasResource ? t('imagePanel.needsImage') : undefined}
      >
        {t(`imagePanel.feature.${tab.id}`)}
      </button>
    )
  })}
</div>
```

- [ ] **Step 6: Update render — Feature-specific content areas**

This is the main rendering switch. Replace all the `panelMode === 'auto'`, `panelMode === 'upscale'`, etc. blocks with feature-based rendering.

For **imageGenerate**: mode pills (text/reference/sketch/character) + upstream slots + prompt + param bar
For **poster**: title + subtitle + bodyText + prompt + param bar (no resolution)
For **imageEdit**: editMode pills (6 modes) + mask tools (inpaint/erase) + prompt (conditional) + strength slider + param bar (no ratio/resolution)
For **upscale**: scale buttons only (2x/4x)
For **outpaint**: direction controls + optional prompt + param bar (count only)

Due to the extensive JSX changes, this step involves rewriting the render body. The exact code is context-dependent on the final visual design but follows the wireframes from the design agents.

- [ ] **Step 7: Update parameter bar — remove model selector**

The bottom parameter bar should only show:
- Aspect ratio selector (imageGenerate, poster only)
- Resolution selector (imageGenerate only)
- Settings gear (toggle advanced)
- Credits indicator
- Count dropdown

- [ ] **Step 8: Run type check and lint**

Run: `pnpm run check-types && pnpm run lint:biome`
Expected: Pass. Fix any type errors from the refactored types.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx
git commit -m "feat(board): redesign ImageAiPanel with 5-feature tabs for SDK v2"
```

### Task 12: Fix ImageNode.tsx Callers

**Files:**
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`

The ImageNode calls `submitImageGenerate` and passes `ImageGenerateParams` from the panel. After Task 9 and 11, the type changed (no `modelId`, has `feature`).

- [ ] **Step 1: Update handleGenerate to map new params**

Find where `onGenerate` is called (around line 547, 635). Update to map `ImageGenerateParams` to `submitImageGenerate` arguments:

```typescript
// In the version stack / regenerate handler:
const { feature, prompt, aspectRatio, resolution, generateMode, inputImages, count, quality, seed, ...rest } = params
await submitImageGenerate(
  {
    prompt: prompt ?? '',
    aspectRatio,
    resolution,
    mode: generateMode,
    referenceImageSrcs: inputImages,
    count,
    quality,
    seed,
  },
  { projectId, saveDir, sourceNodeId },
)
```

- [ ] **Step 2: Update AiGenerateConfig writes to include feature**

Where `onUpdate({ aiConfig: ... })` is called, add `feature`:
```typescript
aiConfig: {
  feature: params.feature,
  prompt: params.prompt ?? '',
  aspectRatio: params.aspectRatio as AiGenerateConfig['aspectRatio'],
  quality: params.quality,
  count: params.count,
}
```

- [ ] **Step 3: Handle upscale params mapping**

For upscale calls (from BoardCanvasInteraction.tsx around line 1455), `submitUpscale` now accepts `scale: 2 | 4` (no `modelId`). Verify the call site is compatible.

- [ ] **Step 4: Run type check**

Run: `pnpm run check-types`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/nodes/ImageNode.tsx apps/web/src/components/board/core/BoardCanvasInteraction.tsx
git commit -m "fix(board): update ImageNode callers for v2 params"
```

### Task 13: i18n — Add Image Panel v2 Keys

**Files:**
- Modify: `apps/web/src/i18n/locales/zh-CN/board.json`
- Modify: `apps/web/src/i18n/locales/en-US/board.json`
- Modify: `apps/web/src/i18n/locales/zh-TW/board.json`

- [ ] **Step 1: Add keys for zh-CN**

In the `imagePanel` section, add:

```json
"feature": {
  "imageGenerate": "生成",
  "poster": "海报",
  "imageEdit": "编辑",
  "upscale": "放大",
  "outpaint": "扩图"
},
"generateMode": {
  "text": "文生图",
  "reference": "参考图",
  "sketch": "草图",
  "character": "角色"
},
"editMode": {
  "instruct": "指令编辑",
  "stylize": "风格化",
  "colorize": "上色",
  "inpaint": "局部重绘",
  "erase": "擦除",
  "eraseWatermark": "去水印"
},
"needsImage": "需要先有图片内容",
"strength": "编辑强度",
"quality": "质量",
"qualityDraft": "草稿",
"qualityStandard": "标准",
"qualityHd": "高清",
"seed": "种子",
"seedRandom": "随机",
"posterTitle": "标题",
"posterTitlePlaceholder": "输入海报标题",
"posterSubTitle": "副标题",
"posterBodyText": "正文",
"posterPromptPlaceholder": "描述海报的视觉风格...",
"outpaintTop": "上",
"outpaintBottom": "下",
"outpaintLeft": "左",
"outpaintRight": "右",
"outpaintHint": "至少一个方向需要大于 1.0"
```

- [ ] **Step 2: Add corresponding en-US keys**

Same structure with English translations.

- [ ] **Step 3: Add corresponding zh-TW keys**

Same structure with Traditional Chinese translations.

- [ ] **Step 4: Run type check**

Run: `pnpm run check-types`
Expected: Pass (JSON files don't affect type checking, but verify no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n/locales/*/board.json
git commit -m "feat(i18n): add image panel v2 translation keys"
```

---

## Phase 3: Video Panel & Services (separate plan)

> Video panel refactoring follows the same pattern as Phase 2 but with 2-level navigation (feature tabs + mode buttons), storyboard scene editor, camera presets, and digitalHuman inputs. To be planned after Phase 2 is verified working.

## Phase 4: Audio Panel & Services (separate plan)

> Audio panel refactoring replaces prompt with text, adds voice selector, referenceAudio handling, and output config. To be planned after Phase 3.

## Phase 5: Polling & Cleanup (separate plan)

> useMediaTaskPolling TaskGroup support, credit-estimate refactor, v1 deprecation markers. To be planned after Phase 4.
