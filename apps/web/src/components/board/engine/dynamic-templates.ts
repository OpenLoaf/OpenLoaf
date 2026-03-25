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
 * 完全基于 capabilities API 数据驱动，不依赖本地 variant registry。
 * 从 variant.inputSlots + variant.resultType 推断输入/输出类型。
 */

import type { MediaType } from '../panels/variants/slot-types'
import type { V3CapabilitiesData } from '@/lib/saas-media'
import { inferAcceptedInputTypes } from '../panels/variants/slot-conventions'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateItem {
  featureId: string
  variantId: string
  nodeType: string
  nodeSize: [number, number]
  preselect: { featureId: string; variantId: string }
  missingInputTypes: MediaType[]
}

export interface TemplateGroup {
  id: MediaType
  labelKey: string
  items: TemplateItem[]
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const OUTPUT_TYPE_ORDER: MediaType[] = ['image', 'video', 'audio', 'text']

const NODE_SIZE_MAP: Record<string, [number, number]> = {
  image: [320, 180],
  video: [320, 180],
  audio: [320, 120],
  text: [200, 200],
}

function groupsFromMap(map: Map<MediaType, TemplateItem[]>): TemplateGroup[] {
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

function getFixedTemplateItems(sourceOutputTypes: MediaType[]): Map<MediaType, TemplateItem[]> {
  const map = new Map<MediaType, TemplateItem[]>()
  if (sourceOutputTypes.includes('video')) {
    map.set('audio', [
      {
        featureId: 'extractAudio',
        variantId: '__fixed-extract-audio',
        nodeType: 'audio',
        nodeSize: NODE_SIZE_MAP.audio,
        preselect: { featureId: 'extractAudio', variantId: '' },
        missingInputTypes: [],
      },
    ])
  }
  return map
}

export function computeOutputTemplates(
  sourceOutputTypes: MediaType[],
  capabilities: V3CapabilitiesData[],
): TemplateGroup[] {
  const groupMap = new Map<MediaType, TemplateItem[]>()

  for (const [type, items] of getFixedTemplateItems(sourceOutputTypes)) {
    groupMap.set(type, [...items])
  }

  if (!capabilities || capabilities.length === 0) return groupsFromMap(groupMap)
  const seenFeatures = new Set<string>()

  for (const cap of capabilities) {
    for (const feature of cap.features) {
      if (seenFeatures.has(feature.id)) continue

      let matchedVariantId: string | undefined
      let matchedOutputType: MediaType | undefined
      let matchedAcceptedTypes: Set<MediaType> | undefined

      for (const v of feature.variants) {
        const outputType = v.resultType as MediaType | undefined
        if (!outputType || !v.inputSlots?.length) continue
        const acceptedTypes = inferAcceptedInputTypes(v.inputSlots)
        if (acceptedTypes.size === 0 && v.inputSlots.every(s => s.accept === 'text')) {
          // Text-only variant (e.g. text-to-image) — always compatible
          matchedVariantId = v.id
          matchedOutputType = outputType
          matchedAcceptedTypes = acceptedTypes
          break
        }
        const hasOverlap = [...acceptedTypes].some((t) => sourceOutputTypes.includes(t))
        if (hasOverlap) {
          matchedVariantId = v.id
          matchedOutputType = outputType
          matchedAcceptedTypes = acceptedTypes
          break
        }
      }

      if (!matchedVariantId || !matchedOutputType) continue

      seenFeatures.add(feature.id)

      const nodeType = matchedOutputType as string
      const nodeSize = NODE_SIZE_MAP[nodeType] ?? [320, 180]
      const missingInputTypes = matchedAcceptedTypes
        ? [...matchedAcceptedTypes].filter((t) => !sourceOutputTypes.includes(t))
        : []

      const item: TemplateItem = {
        featureId: feature.id,
        variantId: matchedVariantId,
        nodeType,
        nodeSize,
        preselect: { featureId: feature.id, variantId: matchedVariantId },
        missingInputTypes,
      }

      const bucket = groupMap.get(matchedOutputType) ?? []
      bucket.push(item)
      groupMap.set(matchedOutputType, bucket)
    }
  }

  return groupsFromMap(groupMap)
}

/**
 * 计算后向拖拽菜单（"什么上游节点能喂给这个节点？"）。
 *
 * Now driven by capabilities data instead of local registry.
 */
export function computeInputTemplates(
  targetNodeType: string,
  capabilities?: V3CapabilitiesData[],
): TemplateGroup[] {
  if (!capabilities || capabilities.length === 0) {
    // Fallback: assume standard input types based on node type
    const defaultAccepted: Record<string, MediaType[]> = {
      image: ['text', 'image'],
      video: ['text', 'image', 'audio'],
      audio: ['text', 'audio'],
    }
    const acceptedTypes = defaultAccepted[targetNodeType]
    if (!acceptedTypes) return []

    const groupMap = new Map<MediaType, TemplateItem[]>()
    for (const mediaType of acceptedTypes) {
      const nodeSize = NODE_SIZE_MAP[mediaType] ?? [320, 180]
      const item: TemplateItem = {
        featureId: mediaType,
        variantId: `upstream-${mediaType}`,
        nodeType: mediaType,
        nodeSize,
        preselect: { featureId: mediaType, variantId: '' },
        missingInputTypes: [],
      }
      const bucket = groupMap.get(mediaType) ?? []
      bucket.push(item)
      groupMap.set(mediaType, bucket)
    }
    return groupsFromMap(groupMap)
  }

  // Collect all accepted input types from matching category's variants
  const acceptedTypes = new Set<MediaType>()
  for (const cap of capabilities) {
    if (cap.category !== targetNodeType) continue
    for (const feature of cap.features) {
      for (const v of feature.variants) {
        if (!v.inputSlots) continue
        for (const t of inferAcceptedInputTypes(v.inputSlots)) {
          acceptedTypes.add(t)
        }
      }
    }
  }

  const groupMap = new Map<MediaType, TemplateItem[]>()
  for (const mediaType of acceptedTypes) {
    const nodeSize = NODE_SIZE_MAP[mediaType] ?? [320, 180]
    const item: TemplateItem = {
      featureId: mediaType,
      variantId: `upstream-${mediaType}`,
      nodeType: mediaType,
      nodeSize,
      preselect: { featureId: mediaType, variantId: '' },
      missingInputTypes: [],
    }
    const bucket = groupMap.get(mediaType) ?? []
    bucket.push(item)
    groupMap.set(mediaType, bucket)
  }

  return groupsFromMap(groupMap)
}
