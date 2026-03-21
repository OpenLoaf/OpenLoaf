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
import { FileTextIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './shared/tool-utils'

/** Extract file_path from Claude Code Read tool input. */
function resolveFilePath(part: AnyToolPart): string {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  return typeof inputObj?.file_path === 'string' ? inputObj.file_path.trim() : ''
}

/** Resolve a short display name from an absolute path. */
function resolveDisplayName(filePath: string): string {
  if (!filePath) return ''
  return filePath.split('/').filter(Boolean).pop() ?? filePath
}

/** Tool card for Claude Code CLI-executed Read calls (providerExecuted: true). */
export default function ClaudeCodeReadTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const filePath = resolveFilePath(part)
  const displayName = resolveDisplayName(filePath)
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
      <button
        type="button"
        onClick={handleOpen}
        disabled={!filePath}
        className={cn(
          'group flex w-full items-center gap-2 overflow-hidden rounded-3xl border bg-card px-3 py-2 text-left',
          'transition-colors duration-150 hover:bg-muted/60',
          !filePath && 'cursor-default opacity-50',
        )}
      >
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-xs text-foreground">
          {filePath || 'Read'}
        </span>
        {displayName && filePath !== displayName ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/60">{displayName}</span>
        ) : null}
      </button>
    </div>
  )
}
