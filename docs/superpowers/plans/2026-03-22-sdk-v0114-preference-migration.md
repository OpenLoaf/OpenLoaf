# SDK v0.1.14 Preference System Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from SDK v0.1.13 to v0.1.14, adopting opaque OL-XX-NNN variant IDs, preference system, removing Kling, adding imageEdit feature.

**Architecture:** Components organized by UI pattern (not model identity). Parameterized `ImgGenTextVariant` covers 4 text-to-image variants via field config. Preference labels from SDK `MEDIA_PREFERENCES` replace variant display names in GenerateActionBar. No backward compatibility with old variant IDs.

**Tech Stack:** React 19, TypeScript, @openloaf-saas/sdk 0.1.14, react-i18next, Zustand

**Spec:** `docs/superpowers/specs/2026-03-22-sdk-v0114-preference-migration-design.md`

**SDK Reference:** `/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf-saas/.agents/skills/openloaf-saas-sdk-reference/` — read SKILL.md + references/media-v3/ for variant params.

---

## Task 1: SDK Upgrade & Type Updates

**Files:**
- Modify: `apps/server/package.json` (SDK version)
- Modify: `apps/web/src/lib/saas-media.ts:98-104` (V3Variant type)

- [ ] **Step 1: Update SDK version in server package.json**

Change the `@openloaf-saas/sdk` dependency to `^0.1.14`. Note: if it currently uses `file:` protocol for local dev, change it to npm version `^0.1.14`.

```json
"@openloaf-saas/sdk": "^0.1.14"
```

- [ ] **Step 2: Add `preference` field to V3Variant type**

In `apps/web/src/lib/saas-media.ts`, update the `V3Variant` type:

```ts
/** v3 capability variant. */
export type V3Variant = {
  id: string
  displayName: string
  preference: string
  creditsPerCall: number
  minMembershipLevel: 'free' | 'lite' | 'pro' | 'premium' | 'infinity'
  capabilities?: Record<string, unknown>
}
```

- [ ] **Step 3: Install and verify**

```bash
cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm install && pnpm run check-types
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml apps/web/src/lib/saas-media.ts
git commit -m "feat(deps): upgrade @openloaf-saas/sdk to v0.1.14, add V3Variant.preference field"
```

---

## Task 2: Delete Kling Variant Components

**Files:**
- Delete: `apps/web/src/components/board/panels/variants/image/ImgGenKlingVariant.tsx`
- Delete: `apps/web/src/components/board/panels/variants/video/VidGenKlingVariant.tsx`
- Delete: `apps/web/src/components/board/panels/variants/video/LipSyncKlingVariant.tsx`

- [ ] **Step 1: Delete the 3 Kling component files**

```bash
cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf
rm apps/web/src/components/board/panels/variants/image/ImgGenKlingVariant.tsx
rm apps/web/src/components/board/panels/variants/video/VidGenKlingVariant.tsx
rm apps/web/src/components/board/panels/variants/video/LipSyncKlingVariant.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A apps/web/src/components/board/panels/variants/
git commit -m "chore(board): delete Kling variant components (offline per SDK v0.1.14)"
```

Note: Type check will fail until Task 3 updates the registries. That's expected.

---

## Task 3: Update Variant Registries & Constraints

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/image/index.ts`
- Modify: `apps/web/src/components/board/panels/variants/video/index.ts`
- Modify: `apps/web/src/components/board/panels/variants/audio/index.ts`

- [ ] **Step 1: Rewrite image/index.ts**

Replace the entire file content. Key changes:
- Remove Kling import and entries
- Remap all IDs from old format to OL-XX-NNN
- Add OL-IG-002/003/004/006 entries pointing to existing components (ImgGenQwenVariant for text-only, ImgGenVolcVariant for ref-image) as temporary placeholders — Task 4 will replace these with the proper ImgGenTextVariant/ImgGenRefVariant
- Add placeholder entries for OL-IE-001/OL-IE-002 (will be created in Task 5)
- Update MASK_PAINT_FEATURES to include 'imageEdit'
- Add MASK_REQUIRED_VARIANTS set

```ts
import type { ComponentType } from 'react'
import type { VariantFormProps, VariantInputConstraints } from '../types'
import { ImgGenQwenVariant } from './ImgGenQwenVariant'
import { ImgGenVolcVariant } from './ImgGenVolcVariant'
import { ImgInpaintVolcVariant } from './ImgInpaintVolcVariant'
import { ImgStyleVolcVariant } from './ImgStyleVolcVariant'
import { OutpaintQwenVariant } from './OutpaintQwenVariant'
import { UpscaleQwenVariant } from './UpscaleQwenVariant'
import { UpscaleVolcVariant } from './UpscaleVolcVariant'

/** Registry mapping v3 variant IDs to their form components. */
export const IMAGE_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  // imageGenerate — text only (placeholder, will be replaced by ImgGenTextVariant in Task 4)
  'OL-IG-001': ImgGenQwenVariant,
  'OL-IG-002': ImgGenQwenVariant,
  'OL-IG-003': ImgGenQwenVariant,
  'OL-IG-004': ImgGenQwenVariant,
  // imageGenerate — with reference images
  'OL-IG-005': ImgGenVolcVariant,
  'OL-IG-006': ImgGenVolcVariant,
  // imageInpaint
  'OL-IP-001': ImgInpaintVolcVariant,
  // imageStyleTransfer
  'OL-ST-001': ImgStyleVolcVariant,
  // upscale
  'OL-UP-001': UpscaleQwenVariant,
  'OL-UP-002': UpscaleVolcVariant,
  // outpaint
  'OL-OP-001': OutpaintQwenVariant,
}

/** Input constraints for each image variant. */
export const IMAGE_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'OL-IG-001': { textOnly: true },
  'OL-IG-002': { textOnly: true },
  'OL-IG-003': { textOnly: true },
  'OL-IG-004': { textOnly: true },
  'OL-IG-005': {},
  'OL-IG-006': {},
  'OL-IP-001': { requiresImage: true },
  'OL-ST-001': { requiresImage: true },
  'OL-UP-001': { requiresImage: true },
  'OL-UP-002': { requiresImage: true },
  'OL-OP-001': { requiresImage: true },
}

/** Feature IDs whose variants may use mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set([
  'imageInpaint',
  'imageEdit',
])

/** Variant IDs that support mask painting. */
export const MASK_PAINT_VARIANTS = new Set([
  'OL-IP-001',
])

/**
 * Variants where mask is REQUIRED (generate disabled without mask).
 * Other MASK_PAINT_VARIANTS treat mask as optional.
 */
export const MASK_REQUIRED_VARIANTS = new Set([
  'OL-IP-001',
])
```

- [ ] **Step 2: Rewrite video/index.ts**

```ts
import type { ComponentType } from 'react'
import type { VariantFormProps, VariantInputConstraints } from '../types'
import { VidGenQwenVariant } from './VidGenQwenVariant'
import { VidGenVolcVariant } from './VidGenVolcVariant'
import { LipSyncVolcVariant } from './LipSyncVolcVariant'

/** Input constraints for each video variant. */
export const VIDEO_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'OL-VG-001': { requiresImage: true },
  'OL-VG-002': { requiresImage: true },
  'OL-VG-003': {},
  'OL-LS-001': { requiresImage: true, requiresAudio: true },
}

/** Registry mapping variant ids to their form components. */
export const VIDEO_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  'OL-VG-001': VidGenQwenVariant,
  'OL-VG-002': VidGenQwenVariant,
  'OL-VG-003': VidGenVolcVariant,
  'OL-LS-001': LipSyncVolcVariant,
}
```

- [ ] **Step 3: Update audio/index.ts**

Change `'tts-qwen'` to `'OL-TT-001'`:

```ts
export const AUDIO_VARIANT_REGISTRY: Record<
  string,
  ComponentType<VariantFormProps>
> = {
  'OL-TT-001': TtsQwenVariant,
}
```

- [ ] **Step 4: Type check**

```bash
pnpm run check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/variants/image/index.ts apps/web/src/components/board/panels/variants/video/index.ts apps/web/src/components/board/panels/variants/audio/index.ts
git commit -m "refactor(board): migrate variant registries to OL-XX-NNN IDs"
```

---

## Task 4: Create ImgGenTextVariant (Parameterized)

**Files:**
- Modify: `apps/web/src/components/board/panels/variants/image/ImgGenQwenVariant.tsx` — rewrite to `ImgGenTextVariant`
- Modify: `apps/web/src/components/board/panels/variants/image/index.ts` — update import

This component replaces `ImgGenQwenVariant` with a parameterized version that conditionally shows/hides negativePrompt and count based on variant ID.

- [ ] **Step 1: Rewrite ImgGenQwenVariant.tsx → ImgGenTextVariant.tsx**

Rename the file and rewrite:

```bash
mv apps/web/src/components/board/panels/variants/image/ImgGenQwenVariant.tsx apps/web/src/components/board/panels/variants/image/ImgGenTextVariant.tsx
```

The new component reads `variant.id` to determine which fields to show:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VariantFormProps } from '../types'
import { BOARD_GENERATE_INPUT } from '../../../ui/board-style-system'
import { IMAGE_GENERATE_ASPECT_RATIO_OPTIONS } from '../../../nodes/node-config'
import { PillSelect, UpstreamTextBadge } from '../shared'

/** Per-variant field visibility config. */
const FIELD_CONFIG: Record<string, { showNegative: boolean; showCount: boolean }> = {
  'OL-IG-001': { showNegative: true, showCount: true },
  'OL-IG-002': { showNegative: false, showCount: false },
  'OL-IG-003': { showNegative: true, showCount: false },
  'OL-IG-004': { showNegative: true, showCount: false },
}
const DEFAULT_CONFIG = { showNegative: false, showCount: false }

const QUALITY_OPTIONS = ['standard', 'hd'] as const
type Quality = (typeof QUALITY_OPTIONS)[number]

const COUNT_OPTIONS = [1, 2, 4] as const

/**
 * Parameterized text-to-image variant form.
 * Covers OL-IG-001 (wan2.6), OL-IG-002 (turbo), OL-IG-003 (plus), OL-IG-004 (basic).
 */
export function ImgGenTextVariant({
  variant,
  upstream,
  disabled,
  onParamsChange,
  onWarningChange,
}: VariantFormProps) {
  const { t } = useTranslation('board')
  const config = FIELD_CONFIG[variant.id] ?? DEFAULT_CONFIG

  const [prompt, setPrompt] = useState(upstream.textContent ?? '')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('auto')
  const [quality, setQuality] = useState<Quality>('standard')
  const [count, setCount] = useState(1)
  const [showNegative, setShowNegative] = useState(false)

  useEffect(() => {
    onWarningChange?.(!prompt.trim()
      ? t('v3.warnings.promptRequired', { defaultValue: 'Please enter a prompt' })
      : null)
  }, [prompt, onWarningChange, t])

  const sync = useCallback(() => {
    onParamsChange({
      inputs: { prompt },
      params: {
        ...(config.showNegative && negativePrompt ? { negativePrompt } : {}),
        aspectRatio,
        quality,
      },
      ...(config.showCount ? { count } : {}),
    })
  }, [prompt, negativePrompt, aspectRatio, quality, count, onParamsChange, config])

  useEffect(() => { sync() }, [sync])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {upstream.textContent ? <UpstreamTextBadge text={upstream.textContent} /> : null}
        <textarea
          className={[
            'min-h-[68px] w-full resize-none rounded-3xl border px-3 py-2 text-sm leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.params.prompt', { defaultValue: 'Describe the image you want...' })}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <PillSelect
          options={IMAGE_GENERATE_ASPECT_RATIO_OPTIONS.map((ratio) => ({
            value: ratio,
            label: ratio === 'auto' ? t('v3.params.ratioAuto', { defaultValue: 'Auto' }) : ratio,
          }))}
          value={aspectRatio}
          onChange={setAspectRatio}
          disabled={disabled}
        />
        <PillSelect
          options={QUALITY_OPTIONS.map((q) => ({
            value: q,
            label: t(`v3.params.quality_${q}`, { defaultValue: q === 'hd' ? 'HD' : 'Standard' }),
          }))}
          value={quality}
          onChange={(v) => setQuality(v as Quality)}
          disabled={disabled}
        />

        <div className="flex-1" />

        {config.showNegative ? (
          <button
            type="button"
            disabled={disabled}
            className={[
              'h-7 rounded-3xl px-2 text-[11px] transition-colors duration-150',
              showNegative
                ? 'bg-foreground/10 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5',
              disabled ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
            onClick={() => setShowNegative(!showNegative)}
          >
            {t('v3.params.negativePrompt', { defaultValue: 'Negative' })}
          </button>
        ) : null}

        {config.showCount ? (
          <PillSelect
            options={COUNT_OPTIONS.map((n) => ({
              value: String(n),
              label: `${n}x`,
            }))}
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            disabled={disabled}
          />
        ) : null}
      </div>

      {config.showNegative && showNegative ? (
        <textarea
          className={[
            'min-h-[40px] w-full resize-none rounded-3xl border px-3 py-2 text-xs leading-relaxed',
            BOARD_GENERATE_INPUT,
            disabled ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
          placeholder={t('v3.params.negativePromptPlaceholder', { defaultValue: 'Things to avoid in the image...' })}
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Rename ImgGenVolcVariant → ImgGenRefVariant**

```bash
mv apps/web/src/components/board/panels/variants/image/ImgGenVolcVariant.tsx apps/web/src/components/board/panels/variants/image/ImgGenRefVariant.tsx
```

Inside the file, rename the export from `ImgGenVolcVariant` to `ImgGenRefVariant`. Update the JSDoc to reference OL-IG-005/OL-IG-006. Keep `prompt` in `params` (not `inputs`) — this is correct for Volcengine variants.

- [ ] **Step 3: Update image/index.ts imports**

Replace imports to use the new names:

```ts
import { ImgGenTextVariant } from './ImgGenTextVariant'
import { ImgGenRefVariant } from './ImgGenRefVariant'
```

Update all registry entries:
```ts
'OL-IG-001': ImgGenTextVariant,
'OL-IG-002': ImgGenTextVariant,
'OL-IG-003': ImgGenTextVariant,
'OL-IG-004': ImgGenTextVariant,
'OL-IG-005': ImgGenRefVariant,
'OL-IG-006': ImgGenRefVariant,
```

- [ ] **Step 4: Type check**

```bash
pnpm run check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/variants/image/
git commit -m "refactor(board): create ImgGenTextVariant (parameterized) and rename ImgGenRefVariant"
```

---

## Task 5: Create imageEdit Variant Components

**Files:**
- Create: `apps/web/src/components/board/panels/variants/image/ImgEditWanVariant.tsx`
- Create: `apps/web/src/components/board/panels/variants/image/ImgEditPlusVariant.tsx`
- Modify: `apps/web/src/components/board/panels/variants/image/index.ts`

Read the SDK variant docs for OL-IE-001 and OL-IE-002 before implementing:
- `OpenLoaf-saas/.agents/skills/openloaf-saas-sdk-reference/references/media-v3/qwen/OL-IE-001_wan26-image.md`
- `OpenLoaf-saas/.agents/skills/openloaf-saas-sdk-reference/references/media-v3/qwen/OL-IE-002_qwen-image-edit-plus.md`

- [ ] **Step 1: Create ImgEditWanVariant.tsx**

OL-IE-001 (wan2.6-image editing):
- inputs: `prompt` (required), `images` (MediaInput[], 1-4 in normal mode, 1 in interleave)
- params: `enable_interleave` (boolean mode switch), `negativePrompt`, `count`

UI structure:
- Image upload slots (like ImgGenRefVariant but with mode-dependent max count)
- Prompt textarea
- Mode toggle (normal / interleave)
- Optional negativePrompt
- The component should accept `nodeResourcePath` and upstream images

Model after `ImgGenRefVariant` (reference image slots) + `ImgGenTextVariant` (negativePrompt toggle).

- [ ] **Step 2: Create ImgEditPlusVariant.tsx**

OL-IE-002 (qwen-image-edit-plus):
- inputs: `prompt` (required), `images` (MediaInput[], 1-3, required), `mask` (MediaInput, optional)
- params: `count`, `negativePrompt`

UI structure:
- Source image slots (required, 1-3)
- Prompt textarea with edit instructions
- Optional negativePrompt

Note: mask is OPTIONAL and injected by ImageAiPanel's mask painting logic (not by this component). The component itself does NOT render mask UI — that's handled by the parent panel when `MASK_PAINT_VARIANTS.has(variant.id)` is true.

- [ ] **Step 3: Update image/index.ts**

Add imports and registry entries:

```ts
import { ImgEditWanVariant } from './ImgEditWanVariant'
import { ImgEditPlusVariant } from './ImgEditPlusVariant'

// Add to IMAGE_VARIANT_REGISTRY:
'OL-IE-001': ImgEditWanVariant,
'OL-IE-002': ImgEditPlusVariant,

// Add to IMAGE_VARIANT_CONSTRAINTS:
'OL-IE-001': {},
'OL-IE-002': { requiresImage: true },

// Add to MASK_PAINT_VARIANTS:
export const MASK_PAINT_VARIANTS = new Set([
  'OL-IP-001',
  'OL-IE-002',
])
```

- [ ] **Step 4: Type check**

```bash
pnpm run check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/variants/image/
git commit -m "feat(board): add ImgEditWanVariant and ImgEditPlusVariant for imageEdit feature"
```

---

## Task 6: Update ImageAiPanel Mask Logic

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx:241,357-365`

- [ ] **Step 1: Import MASK_REQUIRED_VARIANTS**

Add `MASK_REQUIRED_VARIANTS` to the import from `./variants/image`:

```ts
import {
  IMAGE_VARIANT_REGISTRY,
  IMAGE_VARIANT_CONSTRAINTS,
  MASK_PAINT_VARIANTS,
  MASK_REQUIRED_VARIANTS,
} from './variants/image'
```

- [ ] **Step 2: Update generate-disable logic**

At line 363, change the mask-required check to use `MASK_REQUIRED_VARIANTS` instead of `MASK_PAINT_VARIANTS`:

```ts
// Old:
if (MASK_PAINT_VARIANTS.has(selectedVariant.id) && !maskResult?.maskDataUrl) return true

// New:
if (MASK_REQUIRED_VARIANTS.has(selectedVariant.id) && !maskResult?.maskDataUrl) return true
```

- [ ] **Step 3: Update panel warning logic**

At line 368, also use `MASK_REQUIRED_VARIANTS`:

```ts
// Old:
const panelWarning = needsMaskPaint && resolvedImageSrc && !maskResult?.maskDataUrl

// New:
const maskRequired = selectedVariant ? MASK_REQUIRED_VARIANTS.has(selectedVariant.id) : false
const panelWarning = maskRequired && resolvedImageSrc && !maskResult?.maskDataUrl
  ? t('imagePanel.maskRequired', { defaultValue: 'Please paint the area to modify' })
  : null
```

- [ ] **Step 4: Type check**

```bash
pnpm run check-types
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx
git commit -m "fix(board): differentiate mask-required vs mask-optional variants in ImageAiPanel"
```

---

## Task 7: Preference Display in GenerateActionBar

**Files:**
- Modify: `apps/web/src/components/board/panels/ImageAiPanel.tsx:533-546`
- Modify: `apps/web/src/components/board/panels/VideoAiPanel.tsx` (similar variant mapping)

The preference labels replace variant displayNames. Panels compute the label from SDK's `MEDIA_PREFERENCES` and pass it as `displayName` in `GenerateActionVariant`.

- [ ] **Step 1: Update ImageAiPanel variant mapping**

At line 533-546, change the `displayName` resolution to use preference labels:

```ts
import { MEDIA_PREFERENCES } from '@openloaf-saas/sdk'

// Inside the component, compute preference lang:
const { i18n } = useTranslation('board')
const prefLang = i18n.language.startsWith('zh') ? 'zh' : 'en'

// In the variants prop to GenerateActionBar:
variants={selectedFeature?.variants?.map((v) => {
  const vc = IMAGE_VARIANT_CONSTRAINTS[v.id]
  const hasImage = Boolean(resolvedImageSrc || upstreamImages?.length)
  const needsImage = vc?.requiresImage && !hasImage
  const prefLabel = MEDIA_PREFERENCES[v.preference as keyof typeof MEDIA_PREFERENCES]?.label[prefLang]
  return {
    id: v.id,
    displayName: prefLabel ?? v.displayName,
    creditsPerCall: v.creditsPerCall,
    incompatible: needsImage,
    incompatibleReason: needsImage
      ? t('v3.constraints.requiresImage', { defaultValue: '需要输入图片' })
      : undefined,
  }
})}
```

- [ ] **Step 2: Apply same change to VideoAiPanel**

Find the equivalent `variants` mapping in `VideoAiPanel.tsx` and apply the same preference label resolution pattern.

- [ ] **Step 3: Type check**

```bash
pnpm run check-types
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/board/panels/ImageAiPanel.tsx apps/web/src/components/board/panels/VideoAiPanel.tsx
git commit -m "feat(board): display preference labels in GenerateActionBar variant selector"
```

---

## Task 8: Update Service Layer Default Variant IDs

**Files:**
- Modify: `apps/web/src/components/board/services/image-generate.ts:104`
- Modify: `apps/web/src/components/board/services/video-generate.ts:133`
- Modify: `apps/web/src/components/board/services/upscale-generate.ts:32`

- [ ] **Step 1: Update image-generate.ts**

Change line 104:
```ts
// Old:
variant: 'img-gen-qwen',
// New:
variant: 'OL-IG-001',
```

- [ ] **Step 2: Update video-generate.ts**

Change line 133:
```ts
// Old:
variant: 'vid-gen-volc',
// New:
variant: 'OL-VG-003',
```

- [ ] **Step 3: Update upscale-generate.ts**

Change line 32:
```ts
// Old:
variant: request.variant ?? 'upscale-qwen',
// New:
variant: request.variant ?? 'OL-UP-001',
```

- [ ] **Step 4: Search for any remaining old variant IDs**

```bash
cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf
grep -r "img-gen-\|vid-gen-\|lip-sync-\|upscale-qwen\|upscale-volc\|outpaint-qwen\|img-inpaint-\|img-style-\|tts-qwen" apps/web/src/ apps/server/src/ --include="*.ts" --include="*.tsx" -l
```

Fix any remaining occurrences.

- [ ] **Step 5: Type check**

```bash
pnpm run check-types
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/board/services/
git commit -m "refactor(board): update default fallback variant IDs to OL-XX-NNN format"
```

---

## Task 9: i18n Updates

**Files:**
- Modify: `apps/web/src/i18n/locales/zh-CN/board.json`
- Modify: `apps/web/src/i18n/locales/zh-TW/board.json`
- Modify: `apps/web/src/i18n/locales/en-US/board.json`
- Modify: `apps/web/src/i18n/locales/ja-JP/board.json`

- [ ] **Step 1: Remove old variant name keys from all 4 language files**

In the `v3.variants` section, remove all entries with old IDs:
- `img-gen-qwen`, `img-gen-volc`, `img-gen-kling`
- `img-inpaint-volc`, `img-style-volc`, `outpaint-qwen`
- `upscale-qwen`, `upscale-volc`
- `vid-gen-qwen`, `vid-gen-volc`, `vid-gen-kling`
- `lip-sync-volc`, `lip-sync-kling`
- `tts-qwen`

These are no longer needed because preference labels come from SDK `MEDIA_PREFERENCES` and variant `displayName` from the capabilities API.

- [ ] **Step 2: Add imageEdit-specific UI strings**

Add new strings for the ImgEditWan and ImgEditPlus forms in all 4 languages:

```json
{
  "v3": {
    "imageEdit": {
      "interleaveMode": "图文混排模式",
      "normalMode": "普通模式",
      "interleaveHint": "最多 1 张参考图",
      "normalHint": "最多 4 张参考图",
      "editPromptPlaceholder": "描述你想要的编辑效果..."
    }
  }
}
```

- [ ] **Step 3: Add `imageInpaint` and `imageStyleTransfer` feature labels if missing**

Check that `v3.feature.imageInpaint` and `v3.feature.imageStyleTransfer` exist. If not, add them.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/locales/
git commit -m "refactor(i18n): remove old variant name keys, add imageEdit UI strings"
```

---

## Task 10: Final Verification & Cleanup

- [ ] **Step 1: Full type check**

```bash
pnpm run check-types
```

- [ ] **Step 2: Lint check**

```bash
pnpm run lint:biome
```

Fix any lint issues.

- [ ] **Step 3: Search for any remaining old variant ID references**

```bash
grep -r "img-gen-\|vid-gen-\|lip-sync-\|upscale-qwen\|upscale-volc\|outpaint-qwen\|img-inpaint-\|img-style-\|tts-qwen" apps/ packages/ --include="*.ts" --include="*.tsx" --include="*.json" -l
```

Should return zero results (excluding node_modules, docs, and git).

- [ ] **Step 4: Dev server smoke test**

```bash
pnpm run dev:web
```

Open the app, navigate to a board, check:
1. Image node panel loads capabilities and shows feature tabs
2. imageEdit tab appears
3. Variant selector shows preference labels
4. Text-to-image variants show correct fields per config
5. Mask painting works for OL-IP-001 (required) and OL-IE-002 (optional)

- [ ] **Step 5: Update board-canvas skill**

Update `apps/web/.agents/skills/board-canvas-development/media-generation.md` to reflect the new architecture (OL-XX-NNN IDs, preference system, imageEdit feature).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore(board): cleanup and verify SDK v0.1.14 preference migration"
```
