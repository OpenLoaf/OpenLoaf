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
import { FileEditIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './shared/tool-utils'

function resolveWriteInput(part: AnyToolPart): { filePath: string; content: string } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  return {
    filePath: typeof inputObj?.file_path === 'string' ? inputObj.file_path.trim() : '',
    content: typeof inputObj?.content === 'string' ? inputObj.content : '',
  }
}

function resolveDisplayName(filePath: string): string {
  if (!filePath) return ''
  return filePath.split('/').filter(Boolean).pop() ?? filePath
}

/** Tool card for Claude Code CLI-executed Write calls (providerExecuted: true). */
export default function ClaudeCodeWriteTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { filePath, content } = resolveWriteInput(part)
  const displayName = resolveDisplayName(filePath)
  const lineCount = content ? content.split('\n').length : 0
  const previewLines = content ? content.split('\n').slice(0, 3).join('\n') : ''

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
            {filePath || 'Write'}
          </button>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Write</span>
        </div>

        {/* 内容预览 */}
        {previewLines ? (
          <div className="border-b bg-muted/20 px-3 py-2">
            <pre className="font-mono text-[10px] leading-relaxed text-foreground/70 whitespace-pre-wrap break-all">
              {previewLines}
              {lineCount > 3 ? `\n… (${lineCount} lines)` : ''}
            </pre>
          </div>
        ) : null}

        {/* 底部元信息 */}
        {filePath ? (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <FileEditIcon className="size-3 shrink-0 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/50">{displayName}</span>
            {lineCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground/40">{lineCount} lines</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
