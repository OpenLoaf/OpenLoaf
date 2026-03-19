/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { memo, useCallback, useState } from 'react'
import { cn } from '@udecode/cn'
import { LayoutTemplate, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { CanvasEngine } from '../engine/CanvasEngine'
import {
  BOARD_TEXT_PRIMARY,
  BOARD_TEXT_AUXILIARY,
  BOARD_TEXT_SECONDARY,
} from '../ui/board-style-system'
import { toolbarSurfaceClassName } from '../ui/ToolbarParts'

import { WORKFLOW_TEMPLATES } from './workflow-templates'
import type { WorkflowTemplate } from './workflow-templates'

interface WorkflowTemplatePickerProps {
  engine: CanvasEngine
  onClose: () => void
}

/**
 * Workflow template picker grid.
 *
 * Displays a selection of predefined workflow templates.
 * When the user picks one, it creates all nodes and connectors,
 * then selects the first node.
 */
const WorkflowTemplatePicker = memo(function WorkflowTemplatePicker({
  engine,
  onClose,
}: WorkflowTemplatePickerProps) {
  const { t } = useTranslation('board')
  const [applying, setApplying] = useState(false)

  const handleSelect = useCallback(
    (template: WorkflowTemplate) => {
      if (applying) return
      setApplying(true)

      try {
        engine.getContainer()?.focus()
        const center = engine.getViewportCenterWorld()
        const result = template.create(center[0], center[1])

        // Create all nodes and collect their IDs
        const nodeIds: (string | null)[] = []
        for (const node of result.nodes) {
          const id = engine.addNodeElement(node.type, node.props, node.xywh)
          nodeIds.push(id)
        }

        // Create connectors between nodes
        for (const conn of result.connectors) {
          const sourceId = nodeIds[conn.sourceIndex]
          const targetId = nodeIds[conn.targetIndex]
          if (sourceId && targetId) {
            engine.addConnectorElement({
              source: { elementId: sourceId },
              target: { elementId: targetId },
              style: 'curve',
              dashed: true,
            })
          }
        }

        // Select the first node
        const firstId = nodeIds[0]
        if (firstId) {
          engine.selection.setSelection([firstId])
        }

        onClose()
      } finally {
        setApplying(false)
      }
    },
    [engine, onClose, applying],
  )

  return (
    <div
      data-canvas-toolbar
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'flex flex-col gap-4 rounded-2xl px-8 py-6',
        toolbarSurfaceClassName,
        'pointer-events-auto',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 select-none">
          <LayoutTemplate size={18} className="text-ol-blue" />
          <span className={cn(BOARD_TEXT_PRIMARY, 'text-base font-semibold')}>
            {t('templates.title')}
          </span>
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full',
            'transition-colors duration-150',
            'hover:bg-foreground/8 dark:hover:bg-foreground/12',
          )}
        >
          <X size={14} className={BOARD_TEXT_SECONDARY} />
        </button>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-3">
        {WORKFLOW_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={applying}
            onPointerDown={(e) => {
              e.stopPropagation()
              handleSelect(template)
            }}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl px-4 py-4',
              'border border-border/40',
              'cursor-pointer select-none',
              'transition-all duration-150',
              'hover:bg-foreground/5 hover:border-border/60',
              'dark:hover:bg-foreground/8',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <span className="text-2xl leading-none">{template.icon}</span>
            <span
              className={cn(BOARD_TEXT_PRIMARY, 'text-sm font-medium')}
            >
              {t(`templates.${template.titleKey}`)}
            </span>
            <span className={cn(BOARD_TEXT_AUXILIARY, 'text-xs text-center')}>
              {t(`templates.${template.descriptionKey}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
})

export default WorkflowTemplatePicker
