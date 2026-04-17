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
import ToolGalleryHarness from '@/test/tool-gallery/ToolGalleryHarness'
import { TOOL_FIXTURE_GROUPS } from '@/test/tool-gallery/fixtures'

export default function TestToolsPage() {
  const [filter, setFilter] = React.useState<string | null>(null)

  const totalCount = TOOL_FIXTURE_GROUPS.reduce(
    (acc, g) => acc + g.fixtures.length,
    0,
  )

  return (
    <div className="h-svh overflow-auto bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">AI Tool UI Gallery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            直接预览所有注册的 AI Tool 组件渲染效果，无需触发真实对话。共 {totalCount} 条
            fixture。
          </p>
        </header>

        <nav
          data-testid="tool-gallery-filter"
          className="mb-6 flex flex-wrap gap-2 text-xs"
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

        <ToolGalleryHarness onlyGroups={filter ? [filter] : undefined} />
      </div>
    </div>
  )
}
