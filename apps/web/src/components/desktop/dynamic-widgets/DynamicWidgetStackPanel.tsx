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
