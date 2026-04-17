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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@openloaf/ui/dialog'
import ToolGalleryHarness from '@/test/tool-gallery/ToolGalleryHarness'
import { TOOL_FIXTURE_GROUPS } from '@/test/tool-gallery/fixtures'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ToolGalleryDialog({ open, onOpenChange }: Props) {
  const [filter, setFilter] = React.useState<string | null>(null)

  const totalCount = React.useMemo(
    () => TOOL_FIXTURE_GROUPS.reduce((acc, g) => acc + g.fixtures.length, 0),
    [],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[92vw] max-w-[1200px] flex-col overflow-hidden p-0 sm:!max-w-[1200px]">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>AI Tool UI Gallery</DialogTitle>
          <DialogDescription>
            直接预览所有注册的 AI Tool 组件渲染效果，无需触发真实对话。共 {totalCount} 条 fixture。
          </DialogDescription>
        </DialogHeader>

        <nav
          data-testid="tool-gallery-filter"
          className="flex shrink-0 flex-wrap gap-2 border-b px-6 py-3 text-xs"
        >
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={
              'rounded-full px-3 py-1 transition-colors duration-150 ' +
              (filter === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70')
            }
          >
            全部
          </button>
          {TOOL_FIXTURE_GROUPS.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => setFilter(group.key)}
              className={
                'rounded-full px-3 py-1 transition-colors duration-150 ' +
                (filter === group.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70')
              }
            >
              {group.label}
              <span className="ml-1 opacity-60">({group.fixtures.length})</span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {open ? <ToolGalleryHarness onlyGroups={filter ? [filter] : undefined} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
