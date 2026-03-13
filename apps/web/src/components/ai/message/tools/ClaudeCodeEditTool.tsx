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
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './shared/tool-utils'

type EditHunk = { old_string: string; new_string: string }

function resolveEditInput(part: AnyToolPart): { filePath: string; hunks: EditHunk[] } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  if (!inputObj) return { filePath: '', hunks: [] }

  const filePath = typeof inputObj.file_path === 'string' ? inputObj.file_path.trim() : ''

  // MultiEdit has edits[] array; Edit has old_string/new_string directly
  if (Array.isArray(inputObj.edits)) {
    const hunks: EditHunk[] = []
    for (const edit of inputObj.edits) {
      const e = asPlainObject(edit)
      if (e) {
        hunks.push({
          old_string: typeof e.old_string === 'string' ? e.old_string : '',
          new_string: typeof e.new_string === 'string' ? e.new_string : '',
        })
      }
    }
    return { filePath, hunks }
  }

  return {
    filePath,
    hunks: [
      {
        old_string: typeof inputObj.old_string === 'string' ? inputObj.old_string : '',
        new_string: typeof inputObj.new_string === 'string' ? inputObj.new_string : '',
      },
    ],
  }
}

function resolveDisplayName(filePath: string): string {
  if (!filePath) return ''
  return filePath.split('/').filter(Boolean).pop() ?? filePath
}

/** Render a single diff hunk with red/green highlighting. */
function DiffHunk({ hunk }: { hunk: EditHunk }) {
  const oldLines = hunk.old_string.split('\n')
  const newLines = hunk.new_string.split('\n')
  const maxPreview = 6

  return (
    <div className="font-mono text-[10px] leading-relaxed">
      {oldLines.slice(0, maxPreview).map((line, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable preview lines
          key={`old-${i}`}
          className="flex gap-1 bg-ol-red/8 px-2"
        >
          <span className="shrink-0 select-none text-ol-red">−</span>
          <span className="text-ol-red break-all">{line}</span>
        </div>
      ))}
      {oldLines.length > maxPreview ? (
        <div className="px-2 text-muted-foreground/40">… +{oldLines.length - maxPreview} lines</div>
      ) : null}
      {newLines.slice(0, maxPreview).map((line, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stable preview lines
          key={`new-${i}`}
          className="flex gap-1 bg-ol-green/8 px-2"
        >
          <span className="shrink-0 select-none text-ol-green">+</span>
          <span className="text-ol-green break-all">{line}</span>
        </div>
      ))}
      {newLines.length > maxPreview ? (
        <div className="px-2 text-muted-foreground/40">… +{newLines.length - maxPreview} lines</div>
      ) : null}
    </div>
  )
}

/** Tool card for Claude Code CLI-executed Edit / MultiEdit calls (providerExecuted: true). */
export default function ClaudeCodeEditTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { filePath, hunks } = resolveEditInput(part)
  const displayName = resolveDisplayName(filePath)
  const isMulti = hunks.length > 1
  const label = isMulti ? 'MultiEdit' : 'Edit'

  const { projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const handleOpen = React.useCallback(() => {
    if (!filePath) return
    const entry = createFileEntryFromUri({ uri: filePath, name: displayName })
    if (!entry) return
    openFile({ entry, tabId, projectId: projectId ?? undefined, rootUri: projectRootUri })
  }, [filePath, displayName, tabId, projectId, projectRootUri])

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-xl border bg-card text-card-foreground">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state="success" />
          <button
            type="button"
            onClick={handleOpen}
            disabled={!filePath}
            className={cn(
              'flex-1 truncate text-left font-mono text-[10px] text-muted-foreground/60',
              filePath && 'hover:text-foreground',
            )}
          >
            {filePath || label}
          </button>
          {isMulti ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              {hunks.length} edits
            </span>
          ) : null}
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        </div>

        {/* Diff hunks */}
        {hunks.length > 0 ? (
          <div className="divide-y">
            {hunks.map((hunk, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable hunk list
              <div key={i} className="py-1">
                <DiffHunk hunk={hunk} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
