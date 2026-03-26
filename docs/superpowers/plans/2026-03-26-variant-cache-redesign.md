# Variant Cache Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buggy `useVariantParamsCache` + scattered `AiGenerateConfig` with a clean, unified cache architecture — single write entry, 300ms debounce, no seed field, field-level merge.

**Architecture:** New `useVariantCache` hook with single `update()` entry point and debounced `onFlush`. New `AiGenerateConfig` type with `lastUsed`/`cache`/`lastGeneration` fields (no backward compat). All three media panels (Image/Video/Audio) converge on the same cache hook. Text panel excluded.

**Tech Stack:** React hooks, TypeScript, Zustand-style ref patterns

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Rewrite** | `panels/hooks/useVariantParamsCache.ts` → rename to `useVariantCache.ts` | New cache hook |
| **Rewrite** | `board-contracts.ts` | New `AiGenerateConfig` + `VariantSnapshot` types |
| **Modify** | `panels/variants/types.ts` | Update `VariantParamsSnapshot` → `VariantSnapshot`, remove seed |
| **Modify** | `panels/variants/serialize.ts` | Remove seed from `FormState` and `V3GenerateRequest` |
| **Modify** | `panels/variants/shared/GenericVariantForm.tsx` | Update `onParamsChange` type |
| **Modify** | `panels/ImageAiPanel.tsx` | Switch to `useVariantCache`, new `AiGenerateConfig` shape |
| **Modify** | `panels/VideoAiPanel.tsx` | Switch to `useVariantCache`, new `AiGenerateConfig` shape |
| **Modify** | `panels/AudioAiPanel.tsx` | Switch to `useVariantCache`, in-memory only (no persist) |
| **Modify** | `nodes/ImageNode.tsx` | Update `buildDeriveNodePatch`, `refreshedAiConfig` |
| **Modify** | `nodes/VideoNode.tsx` | Update `buildDeriveNodePatch` |
| **Modify** | `nodes/AudioNode.tsx` | Add `aiConfig` persist, update `buildGeneratePatch`/`buildDeriveNodePatch` |
| **Modify** | `nodes/node-types.ts` | AudioNodeProps add `aiConfig` field |
| **Modify** | `core/BoardCanvasInteraction.tsx` | Update `preselect` → `lastUsed`, `aiConfig` shape |
| **Modify** | `services/image-generate.ts` | Remove `seed` field |
| **Modify** | `services/video-generate.ts` | Remove `seed` field |
| **Modify** | `services/audio-generate.ts` | Remove `seed` field |
| **Modify** | `lib/saas-media.ts` | Remove `seed` from `V3GenerateRequest` |
| **Modify** | `nodes/shared/useMediaGeneration.ts` | Remove `seed` from `GenerateParams` |
| **Modify** | `ui/NodeSearchPanel.tsx` | Update `aiConfig.prompt` → `aiConfig.lastGeneration?.prompt` |
| **Modify** | `panels/variants/__tests__/serialize.vitest.ts` | Remove seed test cases |
| **Modify** | `panels/variants/__tests__/fixtures.ts` | Remove seed from fixtures |
| **Modify** | `panels/variants/__tests__/variant-schema.vitest.ts` | Remove seed references |
| **Delete** | `panels/hooks/useVariantParamsCache.ts` | Old hook (after new one is in place) |

---

## Task 1: New types — `VariantSnapshot` + `AiGenerateConfig`

**Files:**
- Modify: `apps/web/src/components/board/board-contracts.ts`
- Modify: `apps/web/src/components/board/panels/variants/types.ts`

- [ ] **Step 1: Rewrite `board-contracts.ts` AiGenerateConfig**

Replace the entire `AiGenerateConfig` type (lines 48-79) and its import:

```typescript
import type { PersistedSlotMap } from './panels/variants/slot-types'

/** Snapshot of variant form params — used for caching and restoring. */
export interface VariantSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  slotAssignment?: PersistedSlotMap
}

/** AI generation configuration stored on nodes created by AI. */
export type AiGenerateConfig = {
  /** Last used feature + variant — restored when panel opens. */
  lastUsed?: { feature: string; variant: string }
  /** Cached variant form params keyed by "feature:variantId". */
  cache?: Record<string, VariantSnapshot>
  /** Metadata written only when a generation completes. */
  lastGeneration?: {
    prompt: string
    feature: string
    variant: string
    aspectRatio?: string
    generatedAt: number
  }
}
```

Also remove the old `VariantParamsSnapshot` import at line 10.

- [ ] **Step 2: Update `panels/variants/types.ts`**

Replace `VariantParamsSnapshot` (lines 31-38) with a re-export from board-contracts:

```typescript
import type { VariantSnapshot } from '../../board-contracts'
export type { VariantSnapshot }
/** @deprecated Use VariantSnapshot */
export type VariantParamsSnapshot = VariantSnapshot
```

Update `VariantFormProps.initialParams` and `onParamsChange` to use `VariantSnapshot`:

```typescript
initialParams?: VariantSnapshot
onParamsChange: (params: VariantSnapshot) => void
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types 2>&1 | head -50`

Expected: Type errors in downstream consumers (panels, nodes) — this is expected and will be fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/board-contracts.ts apps/web/src/components/board/panels/variants/types.ts
git commit -m "refactor(board): replace AiGenerateConfig and VariantParamsSnapshot with new types"
```

---

## Task 2: New `useVariantCache` hook

**Files:**
- Create: `apps/web/src/components/board/panels/hooks/useVariantCache.ts`

- [ ] **Step 1: Write the new hook**

```typescript
/**
 * useVariantCache — debounced variant params cache with single write entry.
 *
 * All param/slot updates go through `update()`. Flushes to node after 300ms
 * of inactivity, or immediately via `flushNow()` (call before generate).
 */

import { useCallback, useEffect, useRef } from 'react'
import type { VariantSnapshot } from '../../board-contracts'

export interface VariantCacheOptions {
  /** Initial cache from node's aiConfig.cache */
  initialCache?: Record<string, VariantSnapshot>
  /** Called when dirty cache needs to persist to node */
  onFlush: (cache: Record<string, VariantSnapshot>) => void
}

export interface VariantCacheReturn {
  /** Single entry point for all updates — field-level merge, auto-debounce */
  update: (key: string, patch: Partial<VariantSnapshot>) => void
  /** Read cached snapshot for a key */
  get: (key: string) => VariantSnapshot | undefined
  /** Synchronous flush — call before generate to ensure latest data */
  flushNow: () => void
  /** Direct ref access for collectParams (read-only) */
  cacheRef: React.MutableRefObject<Record<string, VariantSnapshot>>
}

export function useVariantCache(options: VariantCacheOptions): VariantCacheReturn {
  const cacheRef = useRef<Record<string, VariantSnapshot>>(options.initialCache ?? {})
  const dirtyRef = useRef(false)
  const flushTimer = useRef<ReturnType<typeof setTimeout>>()
  const onFlushRef = useRef(options.onFlush)
  onFlushRef.current = options.onFlush

  const flushNow = useCallback(() => {
    clearTimeout(flushTimer.current)
    if (dirtyRef.current) {
      onFlushRef.current({ ...cacheRef.current })
      dirtyRef.current = false
    }
  }, [])

  const update = useCallback(
    (key: string, patch: Partial<VariantSnapshot>) => {
      const prev = cacheRef.current[key] ?? { inputs: {}, params: {} }
      cacheRef.current[key] = {
        inputs: patch.inputs !== undefined ? { ...prev.inputs, ...patch.inputs } : prev.inputs,
        params: patch.params !== undefined ? { ...prev.params, ...patch.params } : prev.params,
        count: patch.count !== undefined ? patch.count : prev.count,
        slotAssignment: patch.slotAssignment !== undefined ? patch.slotAssignment : prev.slotAssignment,
      }
      dirtyRef.current = true
      clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => {
        if (dirtyRef.current) {
          onFlushRef.current({ ...cacheRef.current })
          dirtyRef.current = false
        }
      }, 300)
    },
    [],
  )

  // Flush on unmount
  useEffect(() => () => { flushNow() }, [flushNow])

  const get = useCallback((key: string) => cacheRef.current[key], [])

  return { update, get, flushNow, cacheRef }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/panels/hooks/useVariantCache.ts
git commit -m "feat(board): add useVariantCache hook with debounced flush"
```

---

## Task 3: Remove seed from serialize + services

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/serialize.ts`
- Modify: `apps/web/src/components/board/services/image-generate.ts`
- Modify: `apps/web/src/components/board/services/video-generate.ts`
- Modify: `apps/web/src/components/board/services/audio-generate.ts`
- Modify: `apps/web/src/lib/saas-media.ts`

- [ ] **Step 1: Update `serialize.ts`**

Remove `seed` from `FormState` (line 27) and from the return value (line 106):

```typescript
interface FormState {
  prompt?: string
  paintResults: Record<string, MediaInput>
  slotAssignments: Record<string, MediaInput[]>
  taskRefs: Record<string, string>
  params: Record<string, unknown>
  count?: number
}

interface V3GenerateRequest {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  ticketId?: string
}
```

Update return (lines 102-107):

```typescript
return {
  inputs,
  params,
  ...(state.count !== undefined && { count: state.count }),
}
```

- [ ] **Step 2: Update three service files**

In each of `image-generate.ts`, `video-generate.ts`, `audio-generate.ts`:
- Remove `seed?: number` from the Request type
- Remove `seed: request.seed` from the `submitV3Generate` call

- [ ] **Step 3: Update `saas-media.ts`**

Remove `seed?: number` from `V3GenerateRequest` (line 199).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/variants/serialize.ts \
  apps/web/src/components/board/services/image-generate.ts \
  apps/web/src/components/board/services/video-generate.ts \
  apps/web/src/components/board/services/audio-generate.ts \
  apps/web/src/lib/saas-media.ts
git commit -m "refactor(board): remove seed field from serialize and service layers"
```

---

## Task 4: Update `GenericVariantForm` callback type

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/shared/GenericVariantForm.tsx`

- [ ] **Step 1: Update imports and props type**

Replace `VariantParamsSnapshot` import with `VariantSnapshot` from `board-contracts` (or the re-export in `types.ts`).

Update `GenericVariantFormProps` (line 62-64):

```typescript
initialParams?: VariantSnapshot
onParamsChange: (params: VariantSnapshot) => void
```

- [ ] **Step 2: Update `onParamsChange` call (lines 506-509)**

The current callback only sends `{ inputs: {}, params }`. It should also include `count` if a count field exists in the form. Remove seed:

```typescript
onParamsChangeRef.current({
  inputs: {},
  params,
})
```

(This stays the same — count is managed separately by the panel, not the form.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/panels/variants/shared/GenericVariantForm.tsx
git commit -m "refactor(board): update GenericVariantForm to use VariantSnapshot type"
```

---

## Task 5: Rewrite `ImageAiPanel` to use `useVariantCache`

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import { useVariantParamsCache } from './hooks/useVariantParamsCache'
```
With:
```typescript
import { useVariantCache } from './hooks/useVariantCache'
```

Update `ImageGenerateParams` — remove `seed`:
```typescript
export type ImageGenerateParams = {
  feature: string
  variant: string
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  prompt?: string
  aspectRatio?: string
}
```

- [ ] **Step 2: Replace cache initialization (lines 164-182)**

Replace the old `useVariantParamsCache` block with:

```typescript
const activeKey = selectedVariant ? `${selectedFeatureId}:${selectedVariant.id}` : ''

const cache = useVariantCache({
  initialCache: aiConfig?.cache,
  onFlush: (cacheMap) => {
    onUpdate({
      aiConfig: {
        ...aiConfigRef.current,
        cache: cacheMap,
      },
    })
  },
})
```

- [ ] **Step 3: Update `collectParams` (lines 239-279)**

Remove `seed` references:

```typescript
const v3Result = serializeForGenerate(mergedSlots ?? [], {
  prompt: effectivePrompt,
  paintResults,
  slotAssignments,
  taskRefs: {},
  params: vp.params,
  count: vp.count,
})
```

Where `vp` is now `cache.get(activeKey) ?? { inputs: {}, params: {} }`.

- [ ] **Step 4: Update `handleGenerate` (lines 281-304)**

Replace with new `AiGenerateConfig` shape:

```typescript
const handleGenerate = useCallback(async () => {
  if (isGenerating) return
  setIsGenerating(true)
  try {
    const params = await collectParams()
    cache.flushNow()
    onUpdate({
      origin: 'ai-generate',
      aiConfig: {
        ...aiConfigRef.current,
        lastUsed: { feature: params.feature, variant: params.variant },
        lastGeneration: {
          prompt: params.prompt ?? '',
          feature: params.feature,
          variant: params.variant,
          aspectRatio: params.aspectRatio,
          generatedAt: Date.now(),
        },
      },
    })
    onGenerate?.(params)
  } catch (err) {
    console.error('[ImageAiPanel] handleGenerate failed:', err)
    toast.error(t('v3.errors.prepareFailed', { defaultValue: '准备生成参数失败，请重试' }))
  } finally {
    setTimeout(() => setIsGenerating(false), 600)
  }
}, [isGenerating, collectParams, onUpdate, onGenerate, t, cache])
```

- [ ] **Step 5: Update `handleGenerateNewNode` (lines 306-323)**

Same pattern — use `lastUsed`/`lastGeneration` instead of flat fields.

- [ ] **Step 6: Update `handleSlotInputsChange` (lines 364-371)**

Use `cache.update()` single entry:

```typescript
const handleSlotInputsChange = useCallback((resolved: ResolvedSlotInputs) => {
  setResolvedSlots(resolved.mediaRefs)
  setSlotsValid(resolved.isValid)
  if (activeKey) {
    cache.update(activeKey, { inputs: resolved.inputs })
  }
}, [cache, activeKey])
```

- [ ] **Step 7: Update `handleSlotAssignmentPersist` (lines 373-378)**

Use `cache.update()` — no more direct ref mutation:

```typescript
const handleSlotAssignmentPersist = useCallback((map: PersistedSlotMap) => {
  if (activeKey) {
    cache.update(activeKey, { slotAssignment: map })
  }
}, [cache, activeKey])
```

- [ ] **Step 8: Update `cachedAssignment` read (line 419-420)**

```typescript
cachedAssignment={cache.get(`${selectedFeatureId}:${selectedVariant.id}`)?.slotAssignment}
```

- [ ] **Step 9: Update `initialParams` and `onParamsChange` (lines 441-450)**

```typescript
initialParams={cache.get(`${selectedFeatureId}:${selectedVariant.id}`)}
onParamsChange={(snapshot) => {
  if (activeKey) {
    cache.update(activeKey, { params: snapshot.params })
  }
  setPricingParams(snapshot.params ?? {})
}}
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx
git commit -m "refactor(board): migrate ImageAiPanel to useVariantCache"
```

---

## Task 6: Rewrite `VideoAiPanel` to use `useVariantCache`

**Files:**
- Modify: `apps/web/src/components/board/panels/VideoAiPanel.tsx`

- [ ] **Step 1: Apply same pattern as ImageAiPanel**

Key changes (mirror Task 5):
- Replace import `useVariantParamsCache` → `useVariantCache`
- Remove `seed` from `VideoGenerateParams`
- Replace cache init (lines 176-188) with `useVariantCache`
- Update `collectParams` (lines 229-267) — remove `seed`, read from `cache.get(cacheKey)`
- Update `handleGenerate` (lines 277-308) — `lastUsed`/`lastGeneration` shape, call `cache.flushNow()`
- Update `handleSlotInputsChange` (lines 196-206) — `cache.update(cacheKey, { inputs })`
- Update `handleSlotAssignmentPersist` (lines 208-216) — `cache.update(cacheKey, { slotAssignment })`
- Update `onParamsChange` callback — `cache.update(cacheKey, { params })`
- Update `cachedAssignment` and `initialParams` reads

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/board/panels/VideoAiPanel.tsx
git commit -m "refactor(board): migrate VideoAiPanel to useVariantCache"
```

---

## Task 7: Rewrite `AudioAiPanel` to use `useVariantCache` **with persist**

**Files:**
- Modify: `apps/web/src/components/board/panels/AudioAiPanel.tsx`
- Modify: `apps/web/src/components/board/nodes/node-types.ts` (if AudioNodeProps needs aiConfig)

- [ ] **Step 1: Check AudioAiPanel props — does it receive `element` + `onUpdate`?**

Currently AudioAiPanel does NOT receive `element`/`onUpdate` (it has no `aiConfig` persist). It receives `upstream`, `onGenerate`, `onGenerateNewNode`.

For now, keep AudioAiPanel as **in-memory only** (same as before but with new hook):

```typescript
const cache = useVariantCache({
  onFlush: () => {}, // no-op: audio nodes don't persist aiConfig yet
})
```

This is a deliberate choice — adding `element`/`onUpdate` to AudioAiPanel requires changes to AudioNode's rendering, which is out of scope for this refactor.

- [ ] **Step 2: Migrate AudioAiPanel to useVariantCache**

Key changes:
- Replace import
- Remove all `seed` references (lines 164, 171, 246)
- Replace `cache.updateParams(...)` calls with `cache.update(cacheKey, { ... })`
- Replace `cache.paramsRef.current` reads with `cache.get(cacheKey)` or `cache.cacheRef.current[cacheKey]`
- Update `buildGenerateParams` — remove `seed` from `serializeForGenerate` call

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/panels/AudioAiPanel.tsx
git commit -m "refactor(board): migrate AudioAiPanel to useVariantCache (in-memory)"
```

---

## Task 8: Update node files

**Files:**
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx`
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx`
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx`

- [ ] **Step 1: Update ImageNode.tsx**

**`refreshedAiConfig` (line 324-327):**
```typescript
const refreshedAiConfig: AiGenerateConfig = {
  ...(element.props.aiConfig ?? {}),
  lastGeneration: {
    ...(element.props.aiConfig?.lastGeneration ?? { prompt: '', feature: '', variant: '', generatedAt: 0 }),
    prompt: snapshot?.prompt || element.props.aiConfig?.lastGeneration?.prompt || '',
  },
}
```

**`buildSnapshot` (lines 445-459) — remove `seed`:**
```typescript
const buildSnapshot = useCallback(
  (input: ImageGenerateParams, up: UpstreamData | null) =>
    createInputSnapshot({
      prompt: input.prompt ?? '',
      parameters: {
        feature: input.feature,
        variant: input.variant,
        count: input.count,
        aspectRatio: input.aspectRatio ?? '1:1',
      },
      upstreamRefs: up?.entries ?? [],
    }),
  [],
)
```

**`buildDeriveNodePatch` (lines 463-486):**
```typescript
const buildDeriveNodePatch = useCallback(
  (params: ImageGenerateParams) => {
    const cacheKey = `${params.feature}:${params.variant}`
    const copiedCache = {
      ...(element.props.aiConfig?.cache ?? {}),
      [cacheKey]: {
        inputs: params.inputs,
        params: params.params,
        count: params.count,
      },
    }
    return {
      aiConfig: {
        lastUsed: { feature: params.feature, variant: params.variant },
        cache: copiedCache,
        lastGeneration: {
          prompt: params.prompt ?? '',
          feature: params.feature,
          variant: params.variant,
          aspectRatio: params.aspectRatio,
          generatedAt: Date.now(),
        },
      },
    }
  },
  [element.props.aiConfig?.cache],
)
```

- [ ] **Step 2: Update VideoNode.tsx**

**`buildDeriveNodePatch` (lines 955-959):**
```typescript
const buildDeriveNodePatch = useCallback(
  (params: VideoGenerateParams) => ({
    aiConfig: {
      lastUsed: { feature: params.feature, variant: params.variant },
      lastGeneration: {
        prompt: params.prompt ?? '',
        feature: params.feature,
        variant: params.variant,
        generatedAt: Date.now(),
      },
    },
  }),
  [],
)
```

- [ ] **Step 3: Update AudioNode.tsx**

**`buildGeneratePatch` (lines 287-301):**
```typescript
const buildGeneratePatch = useCallback(
  (params: AudioGenerateParams) => {
    const promptText = (params.inputs?.text as string) ?? ''
    return {
      fileName: promptText.slice(0, 30).trim() || undefined,
      aiConfig: {
        lastUsed: { feature: params.feature, variant: params.variant },
        lastGeneration: {
          prompt: promptText,
          feature: params.feature,
          variant: params.variant,
          generatedAt: Date.now(),
        },
      },
    }
  },
  [],
)
```

Also update `promptLabel` reads (lines 236 AND 243) — from `element.props.aiConfig?.prompt` to `element.props.aiConfig?.lastGeneration?.prompt`.

**`buildDeriveNodePatch` (lines 293-300):**
```typescript
const buildDeriveNodePatch = useCallback(
  (params: AudioGenerateParams) => ({
    aiConfig: {
      lastUsed: { feature: params.feature, variant: params.variant },
      lastGeneration: {
        prompt: (params.inputs?.text as string) ?? '',
        feature: params.feature,
        variant: params.variant,
        generatedAt: Date.now(),
      },
    },
  }),
  [],
)
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/nodes/ImageNode.tsx \
  apps/web/src/components/board/nodes/VideoNode.tsx \
  apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): update node files to new AiGenerateConfig shape"
```

---

## Task 9: Update `BoardCanvasInteraction`

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasInteraction.tsx`

- [ ] **Step 1: Update preselect → lastUsed (line 1460-1466)**

```typescript
if (item.preselect.featureId && item.preselect.variantId) {
  props.aiConfig = {
    lastUsed: {
      feature: item.preselect.featureId,
      variant: item.preselect.variantId,
    },
  }
}
```

- [ ] **Step 2: Update upscale aiConfig (line 1587-1590)**

```typescript
aiConfig: {
  lastUsed: { feature: UPSCALE_FEATURE_ID, variant: '' },
  lastGeneration: {
    feature: UPSCALE_FEATURE_ID,
    variant: '',
    prompt: promptText,
    generatedAt: Date.now(),
  },
},
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/core/BoardCanvasInteraction.tsx
git commit -m "refactor(board): update BoardCanvasInteraction to new AiGenerateConfig"
```

---

## Task 10: Update panel `initialFeatureId` reads

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx` (line 136)
- Modify: `apps/web/src/components/board/panels/VideoAiPanel.tsx` (line 147)

- [ ] **Step 1: Update ImageAiPanel initialFeatureId**

```typescript
const initialFeatureId = aiConfig?.lastUsed?.feature
  ?? (nodeHasImage ? 'imageEdit' : 'imageGenerate')
```

Also update `cachedFeatureId`:
```typescript
cachedFeatureId: aiConfig?.lastUsed?.feature,
```

- [ ] **Step 2: Update VideoAiPanel initialFeatureId**

```typescript
initialFeatureId: aiConfig?.lastUsed?.feature ?? '',
cachedFeatureId: aiConfig?.lastUsed?.feature,
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx \
  apps/web/src/components/board/panels/VideoAiPanel.tsx
git commit -m "refactor(board): read initialFeatureId from lastUsed"
```

---

## Task 11: Update `useMediaGeneration` + `NodeSearchPanel`

**Files:**
- Modify: `apps/web/src/components/board/nodes/shared/useMediaGeneration.ts`
- Modify: `apps/web/src/components/board/ui/NodeSearchPanel.tsx`

- [ ] **Step 1: Remove `seed` from `GenerateParams` in `useMediaGeneration.ts` (line 42)**

Delete `seed?: number` from the `GenerateParams` type.

- [ ] **Step 2: Update `NodeSearchPanel.tsx`**

Lines 101-102 and 132-133 read `aiConfig.prompt`. Update to:

```typescript
// line 101-102
if (aiConfig && typeof aiConfig.lastGeneration?.prompt === "string" && aiConfig.lastGeneration.prompt) {
  parts.push(aiConfig.lastGeneration.prompt)
}

// line 132-133
if (aiConfig && typeof aiConfig.lastGeneration?.prompt === "string" && aiConfig.lastGeneration.prompt) {
  return truncate(aiConfig.lastGeneration.prompt)
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/board/nodes/shared/useMediaGeneration.ts \
  apps/web/src/components/board/ui/NodeSearchPanel.tsx
git commit -m "refactor(board): remove seed from useMediaGeneration, update NodeSearchPanel prompt reads"
```

---

## Task 12: Remove seed from zod schemas + node buildSnapshot

**Files:**
- Modify: `apps/web/src/components/board/nodes/ImageNode.tsx` (lines 406, 441, 455, 473, 1157)
- Modify: `apps/web/src/components/board/nodes/VideoNode.tsx` (lines 970, 1294)
- Modify: `apps/web/src/components/board/nodes/AudioNode.tsx` (lines 311, 503)

- [ ] **Step 1: ImageNode.tsx — remove all seed references**

- Line 406: remove `seed: params.seed` from `buildSnapshot` parameters object
- Line 441: remove `seed: params.seed` from `submitImageGenerate` call
- Line 455: remove `seed: input.parameters?.seed` from `buildRetryParams`
- Line 473: remove `seed: params.seed` from `buildDeriveNodePatch` cache entry
- Line 1157: remove `seed: z.number().optional()` from zod schema

- [ ] **Step 2: VideoNode.tsx — remove seed references**

- Line 970: remove `seed: params.seed` from `buildSnapshot`
- Line 1294: remove `seed: z.number().optional()` from zod schema

- [ ] **Step 3: AudioNode.tsx — remove seed references**

- Line 311: remove `seed: params.seed` from `submitAudioGenerate` call
- Line 503: remove `seed: z.number().optional()` from zod schema

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/nodes/ImageNode.tsx \
  apps/web/src/components/board/nodes/VideoNode.tsx \
  apps/web/src/components/board/nodes/AudioNode.tsx
git commit -m "refactor(board): remove seed from node zod schemas and snapshot builders"
```

---

## Task 13: Update test files

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/__tests__/serialize.vitest.ts`
- Modify: `apps/web/src/components/board/panels/variants/__tests__/fixtures.ts`
- Modify: `apps/web/src/components/board/panels/variants/__tests__/variant-schema.vitest.ts`

- [ ] **Step 1: `fixtures.ts` — remove `seed` field (line 23)**

- [ ] **Step 2: `serialize.vitest.ts` — update seed tests (lines 152-163)**

- Remove test "should include count and seed when present" or update to only test `count`
- Remove test "should omit count and seed when undefined" or update to only test `count`

- [ ] **Step 3: `variant-schema.vitest.ts` — remove seed spread (line 57)**

Remove `...(fixture.seed != null ? { seed: fixture.seed } : {})`.

- [ ] **Step 4: Run tests**

```bash
cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm vitest run apps/web/src/components/board/panels/variants/__tests__/ --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/variants/__tests__/
git commit -m "test(board): update variant tests for seed removal and new types"
```

---

## Task 14: Delete old hook + final type check

**Files:**
- Delete: `apps/web/src/components/board/panels/hooks/useVariantParamsCache.ts`

- [ ] **Step 1: Delete old hook file**

```bash
rm apps/web/src/components/board/panels/hooks/useVariantParamsCache.ts
```

- [ ] **Step 2: Search for any remaining references**

```bash
grep -r "useVariantParamsCache\|VariantParamsSnapshot\|paramsCache\|\.seed" apps/web/src/components/board/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining references.

- [ ] **Step 3: Verify types compile**

Run: `pnpm run check-types`

Expected: Clean pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src/components/board/
git commit -m "refactor(board): delete old useVariantParamsCache and clean up references"
```

---

## Task 15: Smoke test

- [ ] **Step 1: Start dev server**

```bash
pnpm run dev:web
```

- [ ] **Step 2: Manual test checklist**

1. Open an image node → AI panel loads with correct feature tab
2. Change params (slider, dropdown) → no console errors
3. Switch variant → switch back → params restored
4. Click "Generate" → request sent with correct `feature`/`variant`/`inputs`/`params`/`count` (no `seed`)
5. Open video node panel → same test
6. Open audio node panel → params work in-memory (no persist to node)
7. Create node from GroupedNodePicker → panel opens with correct feature/variant preselected
8. Derive node (connector drop) → new node has correct `aiConfig.cache` copied

- [ ] **Step 3: Final commit if any fixes needed**
