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

import { GlobeIcon, SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './shared/tool-utils'

type WebKind = 'webfetch' | 'websearch'

function resolveWebInput(part: AnyToolPart, kind: WebKind): { primary: string; label: string } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  if (!inputObj) return { primary: '', label: kind === 'webfetch' ? 'WebFetch' : 'WebSearch' }

  if (kind === 'webfetch') {
    return {
      primary: typeof inputObj.url === 'string' ? inputObj.url.trim() : '',
      label: 'WebFetch',
    }
  }

  return {
    primary: typeof inputObj.query === 'string' ? inputObj.query.trim() : '',
    label: 'WebSearch',
  }
}

/** Tool card for Claude Code CLI-executed WebFetch / WebSearch calls (providerExecuted: true). */
export default function ClaudeCodeWebTool({
  part,
  kind,
  className,
}: {
  part: AnyToolPart
  kind: WebKind
  className?: string
}) {
  const { primary, label } = resolveWebInput(part, kind)
  const Icon = kind === 'webfetch' ? GlobeIcon : SearchIcon

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="flex w-full items-center gap-2 overflow-hidden rounded-lg border bg-card px-3 py-2">
        <Icon className="size-3.5 shrink-0 text-ol-blue" />
        <span className="flex-1 truncate text-xs text-foreground">
          {primary || label}
        </span>
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
