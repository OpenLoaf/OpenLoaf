/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import * as React from 'react'
import { ExternalLinkIcon } from 'lucide-react'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './tool-utils'

type OutputData = Record<string, unknown>

export function parseOutput(part: AnyToolPart): { ok: boolean; data: OutputData | null; error?: string } {
  const output = asPlainObject(part.output)
  if (!output) return { ok: false, data: null }
  const ok = output.ok !== false
  const data = asPlainObject(output.data)
  if (!ok) {
    const errText = typeof output.error === 'string' ? output.error : undefined
    return { ok: false, data, error: errText }
  }
  return { ok: true, data }
}

export function parseInput(part: AnyToolPart): Record<string, unknown> | null {
  const input = normalizeToolInput(part.input)
  return asPlainObject(input)
}

export function getMode(data: OutputData | null, input: Record<string, unknown> | null): string {
  if (typeof data?.mode === 'string') return data.mode
  if (typeof data?.action === 'string') return data.action
  if (typeof input?.mode === 'string') return input.mode
  if (typeof input?.action === 'string') return input.action
  return ''
}

export { getToolKind } from './tool-utils'

export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length <= 3 ? p : `…/${parts.slice(-2).join('/')}`
}

export function EmptyView() {
  return <div className="py-2 text-center text-xs text-muted-foreground">—</div>
}

/** Clickable file path that opens the file in the stack viewer. */
export function FilePathLink({ filePath }: { filePath: string }) {
  const { projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined
  const displayName = filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!filePath) return
      const entry = createFileEntryFromUri({ uri: filePath, name: displayName })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, rootUri: projectRootUri })
    },
    [filePath, displayName, tabId, projectId, projectRootUri],
  )

  return (
    <span
      role="button"
      tabIndex={0}
      className="inline-flex cursor-pointer items-center gap-1 truncate font-mono text-ol-blue hover:text-ol-blue/80 hover:underline"
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(e as unknown as React.MouseEvent) }}
    >
      {shortPath(filePath)}
      <ExternalLinkIcon className="inline size-3 shrink-0" />
    </span>
  )
}
