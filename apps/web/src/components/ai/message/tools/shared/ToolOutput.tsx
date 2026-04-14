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

import { LoaderCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BundledLanguage } from 'shiki'
import { CodeBlock } from '@/components/ai-elements/code-block'
import { CollapsibleContent } from '@openloaf/ui/collapsible'
import { cn } from '@/lib/utils'

const COMPACT_CODEBLOCK_CLASS =
  'rounded-lg border-0 bg-transparent [&_code]:!text-[11px] [&_pre]:!px-2 [&_pre]:!py-1.5 [&_pre]:!text-[11px] [&_pre]:!leading-[1.35]'

export function ToolOutputContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <CollapsibleContent className={cn('px-2 py-1 text-[11px]', className)}>
      {children}
    </CollapsibleContent>
  )
}

export function ToolOutputCode({
  code,
  language,
  maxHeight = 260,
  className,
}: {
  code: string
  language?: BundledLanguage | string
  maxHeight?: number
  className?: string
}) {
  return (
    <div
      className="overflow-auto rounded-lg bg-muted/50"
      style={{ maxHeight }}
    >
      <CodeBlock
        code={code}
        language={(language ?? 'text') as BundledLanguage}
        className={cn(COMPACT_CODEBLOCK_CLASS, className)}
      />
    </div>
  )
}

export function ToolOutputText({
  text,
  maxHeight = 260,
  className,
}: {
  text: string
  maxHeight?: number
  className?: string
}) {
  return (
    <pre
      className={cn(
        'overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/50 px-2 py-1.5 font-mono text-[11px] leading-[1.35] text-muted-foreground',
        className,
      )}
      style={{ maxHeight }}
    >
      {text}
    </pre>
  )
}

export function ToolOutputError({ message }: { message: string }) {
  return (
    <div className="whitespace-pre-wrap break-all rounded-lg bg-destructive/10 px-2 py-1 text-[11px] leading-[1.35] text-destructive">
      {message}
    </div>
  )
}

export function ToolOutputLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground">
      <LoaderCircleIcon className="size-3 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
