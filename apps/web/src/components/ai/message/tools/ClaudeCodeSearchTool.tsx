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

import { FolderIcon, SearchIcon, TextSearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './shared/tool-utils'

type SearchKind = 'glob' | 'grep' | 'ls'

function resolveSearchInput(part: AnyToolPart, kind: SearchKind) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  if (!inputObj) return { primary: '', secondary: '' }

  if (kind === 'ls') {
    return {
      primary: typeof inputObj.path === 'string' ? inputObj.path.trim() : '',
      secondary: '',
    }
  }

  const pattern = typeof inputObj.pattern === 'string' ? inputObj.pattern.trim() : ''
  const path = typeof inputObj.path === 'string' ? inputObj.path.trim() : ''
  const include = typeof inputObj.include === 'string' ? inputObj.include.trim() : ''
  const secondary = [path, include].filter(Boolean).join(' · ')

  return { primary: pattern, secondary }
}

const KIND_META: Record<SearchKind, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  glob: { label: 'Glob', Icon: FolderIcon },
  grep: { label: 'Grep', Icon: TextSearchIcon },
  ls: { label: 'LS', Icon: SearchIcon },
}

/** Tool card for Claude Code CLI-executed Glob / Grep / LS calls (providerExecuted: true). */
export default function ClaudeCodeSearchTool({
  part,
  kind,
  className,
}: {
  part: AnyToolPart
  kind: SearchKind
  className?: string
}) {
  const { primary, secondary } = resolveSearchInput(part, kind)
  const { label, Icon } = KIND_META[kind]

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div
        className={cn(
          'group flex w-full items-center gap-2 overflow-hidden rounded-3xl border bg-card px-3 py-2',
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-xs text-foreground">
          {primary || label}
        </span>
        {secondary ? (
          <span className="shrink-0 max-w-[120px] truncate text-[10px] text-muted-foreground/50">
            {secondary}
          </span>
        ) : null}
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
