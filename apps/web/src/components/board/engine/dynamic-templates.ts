/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Dynamic template computation engine.
 *
 * Derives NodePicker template groups from variant declarations without
 * any hardcoded per-node connector template lists.  All functions are
 * pure (no React, no side effects).
 */

import type { MediaType } from '../panels/variants/slot-types'
import { IMAGE_VARIANTS } from '../panels/variants/image'
import { VIDEO_VARIANTS } from '../panels/variants/video'
import { AUDIO_VARIANTS } from '../panels/variants/audio'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateItem {
  /** Variant ID, e.g. "OL-IG-001". */
  variantId: string
  /** i18n key for the item label, e.g. "dynamicTemplates.variant.OL-IG-001.label". */
  labelKey: string
  /** i18n key for the item description (optional). */
  descriptionKey?: string
  /** Target node type to create when this item is selected. */
  nodeType: string
  /** Default [width, height] for the newly created node. */
  nodeSize: [number, number]
  /** Preselect configuration to set on the new node's AI panel. */
  preselect: { featureId: string; variantId: string }
  /**
   * Input types that the source node cannot provide.
   * A non-empty array signals that the user must supply additional inputs
   * manually before generation can run.
   */
  missingInputTypes: MediaType[]
}

export interface TemplateGroup {
  /** Output media type produced by all items in this group. */
  id: MediaType
  /** i18n key for the group label, e.g. "dynamicTemplates.group.image". */
  labelKey: string
  items: TemplateItem[]
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Canonical sort order for output-type groups. */
const OUTPUT_TYPE_ORDER: MediaType[] = ['text', 'image', 'video', 'audio']

/** Default node dimensions keyed by node type / media type. */
const NODE_SIZE_MAP: Record<string, [number, number]> = {
  image: [320, 180],
  video: [320, 180],
  audio: [320, 120],
  text: [200, 200],
}

/**
 * Prefix → feature ID reverse lookup.
 * Variant IDs follow the pattern "OL-<PREFIX>-<NNN>".
 */
const PREFIX_TO_FEATURE: Record<string, string> = {
  'OL-IG': 'imageGenerate',
  'OL-IP': 'imageInpaint',
  'OL-ST': 'styleTransfer',
  'OL-UP': 'upscale',
  'OL-OP': 'outpaint',
  'OL-IE': 'imageEdit',
  'OL-ME': 'materialExtract',
  'OL-VG': 'videoGenerate',
  'OL-LS': 'lipSync',
  'OL-DH': 'digitalHuman',
  'OL-FS': 'faceSwap',
  'OL-VT': 'videoTranslate',
  'OL-TT': 'tts',
  'OL-SR': 'speechRecognition',
}

/** All variant registries in a single iterable structure. */
const ALL_REGISTRIES = [
  IMAGE_VARIANTS,
  VIDEO_VARIANTS,
  AUDIO_VARIANTS,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the "OL-XX" prefix from a variant ID like "OL-IG-001".
 * Returns undefined when the ID does not match the expected pattern.
 */
function variantPrefix(variantId: string): string | undefined {
  const parts = variantId.split('-')
  // Expected: ["OL", "IG", "001"]
  if (parts.length < 3) return undefined
  return `${parts[0]}-${parts[1]}`
}

/** Resolve the feature ID for a given variant ID. */
function featureIdForVariant(variantId: string): string | undefined {
  const prefix = variantPrefix(variantId)
  if (!prefix) return undefined
  return PREFIX_TO_FEATURE[prefix]
}

/** Map a media type to a node type string. */
function nodeTypeForMedia(mediaType: MediaType): string {
  return mediaType // node types mirror media type names
}

/** Build a TemplateItem for a given variant ID and computed missing types. */
function buildTemplateItem(
  variantId: string,
  producesOutputType: MediaType,
  missingInputTypes: MediaType[],
): TemplateItem {
  const featureId = featureIdForVariant(variantId) ?? 'unknown'
  const nodeType = nodeTypeForMedia(producesOutputType)
  const nodeSize = NODE_SIZE_MAP[nodeType] ?? [320, 180]

  return {
    variantId,
    labelKey: `dynamicTemplates.variant.${variantId}.label`,
    descriptionKey: `dynamicTemplates.variant.${variantId}.description`,
    nodeType,
    nodeSize,
    preselect: { featureId, variantId },
    missingInputTypes,
  }
}

/**
 * Convert a flat map of MediaType → TemplateItem[] into a sorted
 * TemplateGroup array.
 */
function groupsFromMap(
  map: Map<MediaType, TemplateItem[]>,
): TemplateGroup[] {
  const groups: TemplateGroup[] = []

  for (const outputType of OUTPUT_TYPE_ORDER) {
    const items = map.get(outputType)
    if (items && items.length > 0) {
      groups.push({
        id: outputType,
        labelKey: `dynamicTemplates.group.${outputType}`,
        items,
      })
    }
  }

  return groups
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute NodePicker templates for a **forward drag** from a node's right
 * anchor (i.e. "what can this node feed into?").
 *
 * @param sourceOutputTypes - Media types produced by the source node.
 * @returns Grouped template entries sorted by output type.
 */
export function computeOutputTemplates(
  sourceOutputTypes: MediaType[],
): TemplateGroup[] {
  const groupMap = new Map<MediaType, TemplateItem[]>()
  const seen = new Set<string>()

  for (const registry of ALL_REGISTRIES) {
    for (const [variantId, def] of Object.entries(registry)) {
      // Skip variants that haven't declared I/O types yet.
      if (!def.acceptsInputTypes || !def.producesOutputType) continue

      // Check if this variant can accept any of the source's output types.
      const hasOverlap = def.acceptsInputTypes.some((t) =>
        sourceOutputTypes.includes(t),
      )
      if (!hasOverlap) continue

      // De-duplicate: each variantId appears at most once.
      if (seen.has(variantId)) continue
      seen.add(variantId)

      // Types the variant needs that the source cannot supply.
      const missingInputTypes = def.acceptsInputTypes.filter(
        (t) => !sourceOutputTypes.includes(t),
      )

      const item = buildTemplateItem(
        variantId,
        def.producesOutputType,
        missingInputTypes,
      )

      const bucket = groupMap.get(def.producesOutputType) ?? []
      bucket.push(item)
      groupMap.set(def.producesOutputType, bucket)
    }
  }

  return groupsFromMap(groupMap)
}

/**
 * Compute NodePicker templates for a **backward drag** from a node's left
 * anchor (i.e. "what upstream node could feed this node?").
 *
 * Returns simple template entries — one per accepted media type — so the
 * user can create an upstream node that produces the required input.
 *
 * @param targetNodeType - The type string of the node being fed into
 *   ("image", "video", "audio", "text").
 * @returns Grouped template entries sorted by output type.
 */
export function computeInputTemplates(
  targetNodeType: string,
): TemplateGroup[] {
  // Resolve the variant registry for the target node type.
  let registry: Record<string, (typeof IMAGE_VARIANTS)[string]>
  switch (targetNodeType) {
    case 'image':
      registry = IMAGE_VARIANTS
      break
    case 'video':
      registry = VIDEO_VARIANTS
      break
    case 'audio':
      registry = AUDIO_VARIANTS
      break
    default:
      return []
  }

  // Collect the union of all accepted input types across all variants.
  const acceptedTypes = new Set<MediaType>()
  for (const def of Object.values(registry)) {
    if (!def.acceptsInputTypes) continue
    for (const t of def.acceptsInputTypes) {
      acceptedTypes.add(t)
    }
  }

  // For each accepted type, emit one "create upstream node" entry.
  // The upstream node type that *produces* this type is the type itself
  // (image node produces image, text node produces text, etc.).
  const groupMap = new Map<MediaType, TemplateItem[]>()

  for (const mediaType of acceptedTypes) {
    // Build a synthetic item using the first eligible variant that accepts
    // this exact type and produces it as input to the target.
    // Since we're creating an *upstream* node, the new node's output type
    // equals the accepted media type.
    const nodeType = nodeTypeForMedia(mediaType)
    const nodeSize = NODE_SIZE_MAP[nodeType] ?? [320, 180]

    // Find any variant from ALL registries that produces this media type,
    // to use as a representative preselect.
    let representativeVariantId: string | undefined
    let representativeFeatureId = 'unknown'

    for (const reg of ALL_REGISTRIES) {
      for (const [vid, def] of Object.entries(reg)) {
        if (def.producesOutputType === mediaType) {
          representativeVariantId = vid
          representativeFeatureId = featureIdForVariant(vid) ?? 'unknown'
          break
        }
      }
      if (representativeVariantId) break
    }

    const item: TemplateItem = {
      variantId: representativeVariantId ?? `upstream-${mediaType}`,
      labelKey: `dynamicTemplates.upstreamGroup.${mediaType}`,
      descriptionKey: `dynamicTemplates.upstreamGroup.${mediaType}.description`,
      nodeType,
      nodeSize,
      preselect: {
        featureId: representativeFeatureId,
        variantId: representativeVariantId ?? '',
      },
      missingInputTypes: [],
    }

    const bucket = groupMap.get(mediaType) ?? []
    bucket.push(item)
    groupMap.set(mediaType, bucket)
  }

  return groupsFromMap(groupMap)
}
