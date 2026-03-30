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
 * 简化版：只按媒体类型（image/video/audio/text）展示可创建的节点类型，
 * 不再展示具体 feature（如 imageGenerate、imageEdit 等）。
 */

import type { MediaType } from '../panels/variants/slot-types'
import type { V3CapabilitiesData } from '@/lib/saas-media'
import { inferAcceptedInputTypes } from '../panels/variants/slot-conventions'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateItem {
  /** 媒体类型 ID，同时作为节点类型 */
  mediaType: MediaType
  nodeType: string
  nodeSize: [number, number]
}

export type TemplateList = TemplateItem[]

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const MEDIA_TYPE_ORDER: MediaType[] = ['image', 'video', 'audio', 'text']

const NODE_SIZE_MAP: Record<string, [number, number]> = {
  image: [320, 180],
  video: [320, 180],
  audio: [320, 120],
  text: [200, 200],
}

function buildItem(mediaType: MediaType): TemplateItem {
  return {
    mediaType,
    nodeType: mediaType,
    nodeSize: NODE_SIZE_MAP[mediaType] ?? [320, 180],
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 前向拖拽：根据源节点 outputTypes 和 capabilities 计算可创建的目标媒体类型。
 * 只要存在至少一个 feature 能接受源类型输入并产出该目标类型，就显示该类型。
 */
export function computeOutputTemplates(
  sourceOutputTypes: MediaType[],
  capabilities: V3CapabilitiesData[],
): TemplateList {
  const reachable = new Set<MediaType>()

  // video 节点可分离出 audio
  if (sourceOutputTypes.includes('video')) {
    reachable.add('audio')
  }

  if (capabilities && capabilities.length > 0) {
    for (const cap of capabilities) {
      for (const feature of cap.features) {
        for (const v of feature.variants) {
          const outputType = v.resultType as MediaType | undefined
          if (!outputType || !v.inputSlots?.length) continue
          if (reachable.has(outputType)) continue

          const acceptedTypes = inferAcceptedInputTypes(v.inputSlots)
          // text-only input slots → always compatible (e.g. text-to-image)
          const isTextOnly = acceptedTypes.size === 0 && v.inputSlots.every(s => s.accept === 'text')
          const hasOverlap = [...acceptedTypes].some((t) => sourceOutputTypes.includes(t))
          if (isTextOnly || hasOverlap) {
            reachable.add(outputType)
          }
        }
      }
    }
  }

  return MEDIA_TYPE_ORDER.filter((t) => reachable.has(t)).map(buildItem)
}

/**
 * 后向拖拽：根据目标节点类型计算可创建的上游媒体类型。
 */
export function computeInputTemplates(
  targetNodeType: string,
  capabilities?: V3CapabilitiesData[],
): TemplateList {
  if (!capabilities || capabilities.length === 0) {
    const defaultAccepted: Record<string, MediaType[]> = {
      image: ['text', 'image'],
      video: ['text', 'image', 'audio'],
      audio: ['text', 'audio'],
    }
    const acceptedTypes = defaultAccepted[targetNodeType]
    if (!acceptedTypes) return []
    return acceptedTypes.map(buildItem)
  }

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

  return MEDIA_TYPE_ORDER.filter((t) => acceptedTypes.has(t)).map(buildItem)
}
