# SDK v0.1.14 Preference System Migration

## Overview

Migrate OpenLoaf frontend and backend from `@openloaf-saas/sdk` v0.1.13 to v0.1.14, adopting the new v3 preference system with opaque variant IDs (`OL-XX-NNN`), removing Kling variants, adding `imageEdit` feature, and displaying preferences where model selection used to be.

## Key SDK Changes

| Dimension | Before (v0.1.13) | After (v0.1.14) |
|---|---|---|
| Variant ID format | Exposes provider: `img-gen-qwen` | Opaque: `OL-IG-001` |
| Model selection | Direct modelId | Via preference mapping |
| Parameter injection | Client passes all | `hardcodedParams` auto-injected by preference |
| Kling variants | 3 variants (img/vid/lip-sync) | Removed (pending API activation) |
| imageEdit feature | Not available | New (OL-IE-001, OL-IE-002) |
| V3Variant schema | No preference field | New required `preference` field |
| SDK exports | — | New `MEDIA_PREFERENCES` enum with i18n labels (zh/en) |

## Variant ID Mapping (Old to New)

Each variant maps to exactly **one** preference. The "Preference" column below shows the variant's assigned preference from the SDK changelog (not the handler's `supportedPreferences` which is a seed/DB concern).

### Image Variants

| Old ID | New ID | Feature | Preference | Handler | Action |
|---|---|---|---|---|---|
| `img-gen-qwen` | `OL-IG-001` | imageGenerate | standard | wan2.6-t2i | Remap |
| — | `OL-IG-002` | imageGenerate | economy | z-image-turbo | New |
| — | `OL-IG-003` | imageGenerate | hd | qwen-image-plus | New |
| — | `OL-IG-004` | imageGenerate | economy | qwen-image | New |
| `img-gen-volc` | `OL-IG-005` | imageGenerate | (DB) | jimeng-t2i-v40 | Remap |
| — | `OL-IG-006` | imageGenerate | (DB) | jimeng-t2i-v31 | New |
| — | `OL-IE-001` | imageEdit | standard | wan2.6-image | New |
| — | `OL-IE-002` | imageEdit | creative | qwen-image-edit-plus | New |
| `img-inpaint-volc` | `OL-IP-001` | imageInpaint | standard | jimeng-inpaint | Remap |
| `img-style-volc` | `OL-ST-001` | imageStyleTransfer | standard | i2i-material | Remap |
| `upscale-qwen` | `OL-UP-001` | upscale | standard | wanx2.1-imageedit | Remap |
| `upscale-volc` | `OL-UP-002` | upscale | hd | image-upscale | Remap |
| `outpaint-qwen` | `OL-OP-001` | outpaint | standard | wanx2.1-imageedit | Remap |
| `img-gen-kling` | — | — | — | — | Delete |

### Video Variants

| Old ID | New ID | Feature | Preference | Handler | Action |
|---|---|---|---|---|---|
| `vid-gen-qwen` | `OL-VG-001` | videoGenerate | economy | wan2.6-i2v-flash | Remap |
| — | `OL-VG-002` | videoGenerate | standard | wan2.6-i2v | New |
| `vid-gen-volc` | `OL-VG-003` | videoGenerate | hd | jimeng-t2v-l20 | Remap |
| `vid-gen-kling` | — | — | — | — | Delete |
| `lip-sync-volc` | `OL-LS-001` | lipSync | standard | digital-human-lip-sync | Remap |
| `lip-sync-kling` | — | — | — | — | Delete |

### Audio Variants

| Old ID | New ID | Feature | Preference | Handler | Action |
|---|---|---|---|---|---|
| `tts-qwen` | `OL-TT-001` | tts | standard | cosyvoice-v3-flash | Remap |

## Component Architecture

### Design Principle

Components are organized by **UI pattern** (input/param signature), not by model identity. One component can serve multiple variants with identical UI, and parameterized components handle variants with minor field differences.

### imageGenerate Components

**Parameter comparison for text-to-image variants:**

| Param | OL-IG-001 | OL-IG-002 | OL-IG-003 | OL-IG-004 |
|---|:---:|:---:|:---:|:---:|
| prompt | Y | Y | Y | Y |
| aspectRatio | Y | Y | Y | Y |
| quality | Y | Y | Y | Y |
| negativePrompt | Y | **N** | Y | Y |
| count (discrete: 1,2,4) | **Y** | N | N | N |

**Solution: `ImgGenTextVariant`** — a single parameterized component with field config:

```ts
const TEXT_VARIANT_CONFIG: Record<string, { showNegative: boolean; showCount: boolean }> = {
  'OL-IG-001': { showNegative: true, showCount: true },
  'OL-IG-002': { showNegative: false, showCount: false },
  'OL-IG-003': { showNegative: true, showCount: false },
  'OL-IG-004': { showNegative: true, showCount: false },
}
```

The component reads config by `variant.id`, defaulting to `{ showNegative: false, showCount: false }` for unknown variants. Count selector uses discrete options `[1, 2, 4]` (matching current UI).

**`ImgGenRefVariant`** — text-to-image with reference images (images[] + style + aspectRatio + quality):
- OL-IG-005 and OL-IG-006 have identical params, share one component.
- **Important**: For Volcengine variants, `prompt` goes in `params` (not `inputs`), unlike Qwen variants. The component must place `prompt` in the `params` field of `onParamsChange`, matching the current `ImgGenVolcVariant` behavior.

### imageEdit Components (New Feature)

**OL-IE-001 (`ImgEditWanVariant`):**
- inputs: prompt (required), images (1-4 reference images)
- params: enable_interleave (mode switch), negativePrompt, count
- Two modes: normal (up to 4 images) vs interleave (1 image, text-image interleaving)

**OL-IE-002 (`ImgEditPlusVariant`):**
- inputs: prompt (required), images (1-3, required), mask (optional)
- params: count, negativePrompt
- Supports optional mask painting (similar to ImgInpaintVolcVariant). Unlike `OL-IP-001` where mask is effectively required, the generate button should NOT be disabled when no mask is painted for `OL-IE-002`.

### Existing Image Components (ID Remap Only)

| Component | Old ID | New ID | Changes |
|---|---|---|---|
| ImgInpaintVolcVariant | `img-inpaint-volc` | `OL-IP-001` | Registry key only |
| ImgStyleVolcVariant | `img-style-volc` | `OL-ST-001` | Registry key only |
| OutpaintQwenVariant | `outpaint-qwen` | `OL-OP-001` | Registry key only |
| UpscaleQwenVariant | `upscale-qwen` | `OL-UP-001` | Registry key only |
| UpscaleVolcVariant | `upscale-volc` | `OL-UP-002` | Registry key only |

### videoGenerate Components

| Component | Variant IDs | Changes |
|---|---|---|
| VidGenQwenVariant | OL-VG-001, OL-VG-002 | Registry alias (identical params) |
| VidGenVolcVariant | OL-VG-003 | Registry key only |
| LipSyncVolcVariant | OL-LS-001 | Registry key only |

### Audio Components

| Component | Variant IDs | Changes |
|---|---|---|
| TtsQwenVariant | OL-TT-001 | Registry key only |

### Deleted Components

- `ImgGenKlingVariant.tsx` — Kling offline
- `VidGenKlingVariant.tsx` — Kling offline
- `LipSyncKlingVariant.tsx` — Kling offline

## Variant Registry & Constraints

### image/index.ts

```ts
export const IMAGE_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  // imageGenerate — text only
  'OL-IG-001': ImgGenTextVariant,
  'OL-IG-002': ImgGenTextVariant,
  'OL-IG-003': ImgGenTextVariant,
  'OL-IG-004': ImgGenTextVariant,
  // imageGenerate — with reference images
  'OL-IG-005': ImgGenRefVariant,
  'OL-IG-006': ImgGenRefVariant,
  // imageEdit (new)
  'OL-IE-001': ImgEditWanVariant,
  'OL-IE-002': ImgEditPlusVariant,
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

export const IMAGE_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'OL-IG-001': { textOnly: true },
  'OL-IG-002': { textOnly: true },
  'OL-IG-003': { textOnly: true },
  'OL-IG-004': { textOnly: true },
  'OL-IG-005': {},                                    // optional ref images
  'OL-IG-006': {},                                    // optional ref images
  'OL-IE-001': {},                                    // optional images
  'OL-IE-002': { requiresImage: true },               // requires source image
  'OL-IP-001': { requiresImage: true },
  'OL-ST-001': { requiresImage: true },
  'OL-UP-001': { requiresImage: true },
  'OL-UP-002': { requiresImage: true },
  'OL-OP-001': { requiresImage: true },
}

/** Feature IDs whose variants may use mask painting on the node. */
export const MASK_PAINT_FEATURES = new Set(['imageInpaint', 'imageEdit'])

/** Variant IDs that support mask painting. */
export const MASK_PAINT_VARIANTS = new Set(['OL-IP-001', 'OL-IE-002'])

/**
 * Variants where mask is REQUIRED (generate disabled without mask).
 * Other MASK_PAINT_VARIANTS treat mask as optional.
 */
export const MASK_REQUIRED_VARIANTS = new Set(['OL-IP-001'])
```

### video/index.ts

```ts
export const VIDEO_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  'OL-VG-001': VidGenQwenVariant,
  'OL-VG-002': VidGenQwenVariant,   // same handler, standard quality
  'OL-VG-003': VidGenVolcVariant,
  'OL-LS-001': LipSyncVolcVariant,
}

export const VIDEO_VARIANT_CONSTRAINTS: Record<string, VariantInputConstraints> = {
  'OL-VG-001': { requiresImage: true },
  'OL-VG-002': { requiresImage: true },
  'OL-VG-003': {},                        // supports text-only or image-to-video
  'OL-LS-001': { requiresImage: true, requiresAudio: true },
}
```

### audio/index.ts (existing file, modify)

```ts
export const AUDIO_VARIANT_REGISTRY: Record<string, ComponentType<VariantFormProps>> = {
  'OL-TT-001': TtsQwenVariant,
}
```

## Preference Display

### UI Location

Preference labels replace the old variant/model selector in `GenerateActionBar`. When a feature has multiple variants, they are displayed as preference options (e.g., "Economy", "Standard", "HD") instead of model names.

### i18n Source

Translations come directly from `MEDIA_PREFERENCES` exported by `@openloaf-saas/sdk`:

```ts
import { MEDIA_PREFERENCES, type MediaPreferenceId } from '@openloaf-saas/sdk'

// MEDIA_PREFERENCES.economy.label.zh → "经济"
// MEDIA_PREFERENCES.standard.label.en → "Standard"
// MEDIA_PREFERENCES.hd.label.zh → "高清"
```

No additional i18n entries in `board.json` are needed for preference labels.

### Language Resolution

Panels resolve the current language from `i18next`:

```ts
const { i18n } = useTranslation()
const prefLang = i18n.language.startsWith('zh') ? 'zh' : 'en'
const label = MEDIA_PREFERENCES[variant.preference]?.label[prefLang]
  ?? variant.displayName  // fallback
```

### GenerateActionBar Changes

Panels (ImageAiPanel/VideoAiPanel) compute the preference label at the call site and pass it as `displayName` in the `GenerateActionVariant` prop to `GenerateActionBar`. No changes to `GenerateActionVariant` type needed — the existing `displayName` field carries the preference label.

The variant selector dropdown:
- Shows preference label as primary text (computed by parent panel)
- Shows `creditsPerCall` as secondary indicator
- Single-variant features hide the selector entirely

## ImageAiPanel — imageEdit Tab

`imageEdit` appears as a new feature tab in `ImageAiPanel`, alongside existing tabs (imageGenerate, imageInpaint, imageStyleTransfer, upscale, outpaint).

The tab is populated dynamically from the capabilities API response. The `imageEdit` feature name translation already exists in `board.json` (all 4 languages), so no new i18n key is needed for the tab label itself.

### Mask Logic for imageEdit

`ImageAiPanel` must differentiate between `MASK_REQUIRED_VARIANTS` (generate blocked without mask) and `MASK_PAINT_VARIANTS` (mask optional). The existing mask-disable logic (`!maskResult?.maskDataUrl`) should only apply for variants in `MASK_REQUIRED_VARIANTS`, not for all `MASK_PAINT_VARIANTS`.

## Type Changes

### V3Variant (saas-media.ts)

```ts
interface V3Variant {
  id: string
  displayName: string
  preference: string              // NEW — e.g., "economy", "standard", "hd"
  creditsPerCall: number
  minMembershipLevel: 'free' | 'lite' | 'pro' | 'premium' | 'infinity'
  capabilities?: Record<string, unknown>
}
```

## Service Layer Default Variant Updates

Three frontend service files contain hardcoded fallback variant IDs for legacy callers. All must be updated:

| File | Old Default | New Default |
|---|---|---|
| `board/services/image-generate.ts:104` | `'img-gen-qwen'` | `'OL-IG-001'` |
| `board/services/video-generate.ts:133` | `'vid-gen-volc'` | `'OL-VG-003'` |
| `board/services/upscale-generate.ts:32` | `'upscale-qwen'` | `'OL-UP-001'` |

## Backend Changes

### SDK Upgrade

Update `@openloaf-saas/sdk` dependency to `^0.1.14` in `apps/server/package.json`.

### mediaProxy.ts — inferResultType

The existing `inferResultType` logic uses `feature.startsWith('image')` which already matches the new `imageEdit` feature. No code change required.

### No Hardcoded Variant IDs

The backend contains zero hardcoded variant IDs. All v3 operations are pure proxy: the backend forwards `{ feature, variant, inputs, params }` from the frontend to the SaaS API without inspecting variant values.

## i18n Changes

### board.json Updates

- Remove all Kling-related translation keys (`img-gen-kling`, `vid-gen-kling`, `lip-sync-kling`)
- Remove old variant ID translation keys (no longer needed; preference labels from SDK + displayName from capabilities API)
- `imageEdit` feature name translation already exists (verified in all 4 languages)
- Add new UI strings for ImgEditWan/ImgEditPlus variant forms (interleave mode label, image edit prompts, etc.)

### Preference Labels

No board.json entries needed — SDK's `MEDIA_PREFERENCES` provides zh/en translations.

## File Change Summary

| Action | Count | Files |
|---|---|---|
| Delete | 3 | ImgGenKlingVariant, VidGenKlingVariant, LipSyncKlingVariant |
| Rewrite | 1 | ImgGenQwenVariant → ImgGenTextVariant (parameterized) |
| Rename | 1 | ImgGenVolcVariant → ImgGenRefVariant |
| New | 2 | ImgEditWanVariant, ImgEditPlusVariant |
| Modify (registry) | 3 | image/index.ts, video/index.ts, audio/index.ts |
| Modify (types) | 1 | saas-media.ts (V3Variant.preference) |
| Modify (panel) | 1 | ImageAiPanel.tsx (imageEdit tab + mask logic) |
| Modify (action bar) | 1 | GenerateActionBar.tsx (preference display) |
| Modify (i18n) | 4 | board.json x 4 languages |
| Modify (backend) | 1 | package.json (SDK version) |
| Modify (services) | 3 | image-generate.ts, video-generate.ts, upscale-generate.ts |
| **Total** | ~21 files | |

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| SDK type breaking changes | Low | SDK maintains backward compat for v3Generate/v3Task |
| Missing variant in registry | Medium | Unregistered variants fall back to raw displayName |
| imageEdit mask integration | Low | Reuses MaskPaintOverlay; new MASK_REQUIRED_VARIANTS set |
| Preference label missing | Low | Fallback to variant.displayName |

## Out of Scope

- Audio panel changes (TTS variant unchanged)
- ModelCategoryTabs image/video tabs (already disabled, separate migration)
- Backward compatibility with old variant IDs (clean cut per user requirement)
- Backend hardcoded variant ID migration (none exist)
