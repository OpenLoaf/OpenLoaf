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

import { BotIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { asPlainObject, normalizeToolInput, truncateText, type AnyToolPart } from './shared/tool-utils'

function resolveTaskInput(part: AnyToolPart): { description: string; prompt: string } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  return {
    description: typeof inputObj?.description === 'string' ? inputObj.description.trim() : '',
    prompt: typeof inputObj?.prompt === 'string' ? inputObj.prompt.trim() : '',
  }
}

/** Tool card for Claude Code CLI-executed Task (sub-agent) calls (providerExecuted: true). */
export default function ClaudeCodeTaskTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { description, prompt } = resolveTaskInput(part)

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-3xl border bg-card text-card-foreground">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state="success" />
          <BotIcon className="size-3.5 shrink-0 text-purple-500" />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            {description || 'Sub-agent Task'}
          </span>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Task</span>
        </div>

        {/* Prompt 折叠 */}
        {prompt ? (
          <details className="group">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[10px] text-muted-foreground hover:text-foreground list-none">
              <span className="transition-transform group-open:rotate-90">▶</span>
              <span>{truncateText(prompt, 80)}</span>
            </summary>
            <div className="border-t px-3 py-2">
              <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-foreground/70">
                {prompt}
              </pre>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}
