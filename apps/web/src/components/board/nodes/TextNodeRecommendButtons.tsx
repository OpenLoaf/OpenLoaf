/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Video, ImagePlus, Volume2 } from 'lucide-react'
import { cn } from '@udecode/cn'
import type { CanvasEngine } from '../engine/CanvasEngine'
import type { CanvasNodeElement } from '../engine/types'
import { deriveNode } from '../utils/derive-node'
import { serializeTextNodeValue } from '../engine/upstream-data'
import type { TextNodeValue } from './TextNode'

// ---------------------------------------------------------------------------
// Connector checks
// ---------------------------------------------------------------------------

/** Check whether a node already has an upstream node of a given type. */
function hasUpstreamOfType(
  engine: CanvasEngine,
  nodeId: string,
  sourceType: string,
): boolean {
  for (const el of engine.doc.getElements()) {
    if (el.kind !== 'connector') continue
    if (!('elementId' in el.target) || el.target.elementId !== nodeId) continue
    if (!('elementId' in el.source)) continue
    const source = engine.doc.getElementById(el.source.elementId)
    if (source && source.kind === 'node' && source.type === sourceType) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Button config
// ---------------------------------------------------------------------------

const RECOMMEND_ICONS = [ImagePlus, Video, Volume2] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type TextNodeRecommendButtonsProps = {
  engine: CanvasEngine
  element: CanvasNodeElement
}

/** AI feature recommendation buttons rendered below a text (sticky) node. */
export const TextNodeRecommendButtons = memo(function TextNodeRecommendButtons({
  engine,
  element,
}: TextNodeRecommendButtonsProps) {
  const { t } = useTranslation('board')

  const isLocked = engine.isLocked() || element.locked
  const isReadOnly =
    (element.props as Record<string, unknown>).readOnlyProjection === true

  // Check text emptiness
  const textValue = (element.props as { value?: TextNodeValue }).value
  const isTextEmpty = useMemo(() => {
    const text = serializeTextNodeValue(textValue)
    return !text.trim()
  }, [textValue])

  const hasUpstreamImage = useMemo(
    () => hasUpstreamOfType(engine, element.id, 'image'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, element.id, element],
  )

  if (isLocked || isReadOnly) return null

  // Build visible items list
  //
  // Rules:
  //   - 下游功能（文生视频、文字转语音）始终显示，可重复点击创建多个节点
  //   - 图片反推提示词：文本为空且无上游图片节点时显示
  type RecommendItem = {
    id: string
    label: string
    icon: typeof ImagePlus
    iconColor: string
    handler: () => void
  }

  const items: RecommendItem[] = []

  if (isTextEmpty && !hasUpstreamImage) {
    items.push({
      id: 'image-reverse-prompt',
      label: t('textNode.recommend.imageReversePrompt'),
      icon: RECOMMEND_ICONS[0],
      iconColor: 'text-ol-blue',
      handler: () =>
        deriveNode({ engine, sourceNodeId: element.id, targetType: 'image', direction: 'upstream' }),
    })
  }
  items.push({
    id: 'text-to-video',
    label: t('textNode.recommend.textToVideo'),
    icon: RECOMMEND_ICONS[1],
    iconColor: 'text-ol-purple',
    handler: () =>
      deriveNode({ engine, sourceNodeId: element.id, targetType: 'video', direction: 'downstream' }),
  })
  items.push({
    id: 'text-to-speech',
    label: t('textNode.recommend.textToSpeech'),
    icon: RECOMMEND_ICONS[2],
    iconColor: 'text-ol-green',
    handler: () =>
      deriveNode({ engine, sourceNodeId: element.id, targetType: 'audio', direction: 'downstream' }),
  })

  return (
    <div
      className="pointer-events-auto absolute top-full left-1/2 mt-3 ol-glass-toolbar flex flex-col gap-0.5 rounded-lg border border-border/50 p-1"
      style={{ transform: 'translateX(-50%) scale(var(--label-scale, 1))', transformOrigin: 'top center' }}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium',
              'transition-colors duration-150 text-secondary-foreground',
              'hover:bg-foreground/8 dark:hover:bg-foreground/10',
            )}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              item.handler()
            }}
          >
            <Icon size={14} className={item.iconColor} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
})
