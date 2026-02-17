'use client'

import * as React from 'react'
import DynamicWidgetRenderer from './DynamicWidgetRenderer'

interface DynamicWidgetStackPanelProps {
  widgetId?: string
  workspaceId?: string
  projectId?: string
}

export default function DynamicWidgetStackPanel({
  widgetId,
  workspaceId,
  projectId,
}: DynamicWidgetStackPanelProps) {
  if (!widgetId || !workspaceId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        缺少 Widget 参数
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-auto">
      <DynamicWidgetRenderer
        widgetId={widgetId}
        workspaceId={workspaceId}
        projectId={projectId}
      />
    </div>
  )
}
