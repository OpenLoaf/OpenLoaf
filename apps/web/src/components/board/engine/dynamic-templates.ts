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
 * 完全基于 capabilities API 数据驱动。本地 variant registry 仅用于
 * 判断 variant 的 acceptsInputTypes / producesOutputType。
 *
 * 显示层级：feature（不是 variant）。
 */

import type { MediaType } from '../panels/variants/slot-types'
import type { V3CapabilitiesData } from '@/lib/saas-media'
import { IMAGE_VARIANTS } from '../panels/variants/image'
import { VIDEO_VARIANTS } from '../panels/variants/video'
import { AUDIO_VARIANTS } from '../panels/variants/audio'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TemplateItem {
  /** Feature ID，来自 capabilities API（如 "imageGenerate"）。 */
  featureId: string
  /** 该 feature 下第一个兼容的 variant ID（用于 preselect）。 */
  variantId: string
  /** 目标节点类型（image/video/audio/text）。 */
  nodeType: string
  /** 新建节点默认尺寸。 */
  nodeSize: [number, number]
  /** 预选配置，设置到新节点 AI 面板。 */
  preselect: { featureId: string; variantId: string }
  /** 源节点无法提供的输入类型。 */
  missingInputTypes: MediaType[]
}

export interface TemplateGroup {
  /** 输出媒体类型（image/video/audio）。 */
  id: MediaType
  /** 分组标题 i18n key。 */
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

/** 合并所有 variant registry。 */
const ALL_VARIANT_DEFS = { ...IMAGE_VARIANTS, ...VIDEO_VARIANTS, ...AUDIO_VARIANTS }

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

/**
 * 基于 capabilities 数据计算前向拖拽的节点选择器菜单。
 *
 * 逻辑：
 * 1. 遍历 capabilities 每个 feature
 * 2. 检查 feature 下的 variant 是否在本地 registry 中有注册
 * 3. 检查注册 variant 的 acceptsInputTypes 是否与源节点兼容
 * 4. 如果有任一兼容 variant，则该 feature 可显示（按 feature 去重）
 * 5. 无 capabilities 数据则返回空（不 fallback）
 *
 * @param sourceOutputTypes 源节点输出的媒体类型
 * @param capabilities capabilities API 返回的数据（可能为空）
 */
/** Fixed (non-AI) template items based on source output types. */
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

  // 固定项（非 AI）放在最前面
  for (const [type, items] of getFixedTemplateItems(sourceOutputTypes)) {
    groupMap.set(type, [...items])
  }

  if (!capabilities || capabilities.length === 0) return groupsFromMap(groupMap)
  const seenFeatures = new Set<string>()

  for (const cap of capabilities) {
    for (const feature of cap.features) {
      if (seenFeatures.has(feature.id)) continue

      // 在该 feature 的 variants 中找第一个：本地有注册 + 输入兼容
      let matchedVariantId: string | undefined
      let matchedDef: (typeof ALL_VARIANT_DEFS)[string] | undefined

      for (const v of feature.variants) {
        const def = ALL_VARIANT_DEFS[v.id]
        if (!def?.acceptsInputTypes || !def.producesOutputType) continue
        if (def.acceptsInputTypes.some((t) => sourceOutputTypes.includes(t))) {
          matchedVariantId = v.id
          matchedDef = def
          break
        }
      }

      if (!matchedVariantId || !matchedDef) continue

      seenFeatures.add(feature.id)

      const outputType = matchedDef.producesOutputType!
      const nodeType = outputType as string
      const nodeSize = NODE_SIZE_MAP[nodeType] ?? [320, 180]
      const missingInputTypes = matchedDef.acceptsInputTypes!.filter(
        (t) => !sourceOutputTypes.includes(t),
      )

      const item: TemplateItem = {
        featureId: feature.id,
        variantId: matchedVariantId,
        nodeType,
        nodeSize,
        preselect: { featureId: feature.id, variantId: matchedVariantId },
        missingInputTypes,
      }

      const bucket = groupMap.get(outputType) ?? []
      bucket.push(item)
      groupMap.set(outputType, bucket)
    }
  }

  return groupsFromMap(groupMap)
}

/**
 * 计算后向拖拽菜单（"什么上游节点能喂给这个节点？"）。
 * 返回每个可接受输入类型一个条目。
 */
export function computeInputTemplates(
  targetNodeType: string,
): TemplateGroup[] {
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

  const acceptedTypes = new Set<MediaType>()
  for (const def of Object.values(registry)) {
    if (!def.acceptsInputTypes) continue
    for (const t of def.acceptsInputTypes) {
      acceptedTypes.add(t)
    }
  }

  const groupMap = new Map<MediaType, TemplateItem[]>()
  for (const mediaType of acceptedTypes) {
    const nodeType = mediaType as string
    const nodeSize = NODE_SIZE_MAP[nodeType] ?? [320, 180]

    const item: TemplateItem = {
      featureId: mediaType,
      variantId: `upstream-${mediaType}`,
      nodeType,
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
