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

import { MessageSquareIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  asPlainObject,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
  type ToolVariant,
} from './shared/tool-utils'

function resolveSendMessageInput(part: AnyToolPart) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const to = typeof inputObj?.to === 'string' ? inputObj.to.trim() : ''
  const message = typeof inputObj?.message === 'string' ? inputObj.message.trim() : ''
  return { to, message }
}

export default function SendMessageTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const { to, message } = resolveSendMessageInput(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'

  const preview = message.length > 80 ? `${message.slice(0, 80)}...` : message

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'group flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
            'transition-colors duration-150 hover:bg-muted/60',
            className,
          )}
        >
          <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">SendMessage</span>
          {to ? (
            <span className="shrink-0 font-mono text-xs text-muted-foreground/70">
              → {to}
            </span>
          ) : null}
          {preview ? (
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
              {preview}
            </span>
          ) : null}
          {streaming ? (
            <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : hasError ? (
            <XCircleIcon className="size-3 shrink-0 text-destructive" />
          ) : null}
        </div>
      </TooltipTrigger>
      {message ? (
        <TooltipContent side="top" className="max-w-md whitespace-pre-wrap text-xs">
          <div className="font-medium">→ {to}</div>
          <div className="mt-1 text-muted-foreground">{message.slice(0, 300)}{message.length > 300 ? '...' : ''}</div>
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}
