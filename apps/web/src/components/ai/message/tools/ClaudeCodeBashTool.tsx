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

import { cn } from '@/lib/utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { asPlainObject, normalizeToolInput, type AnyToolPart } from './shared/tool-utils'

/** Extract command and description from Claude Code Bash tool input. */
function resolveBashInput(part: AnyToolPart): { command: string; description: string } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  return {
    command: typeof inputObj?.command === 'string' ? inputObj.command.trim() : '',
    description: typeof inputObj?.description === 'string' ? inputObj.description.trim() : '',
  }
}

/** Tool card for Claude Code CLI-executed Bash calls (providerExecuted: true). */
export default function ClaudeCodeBashTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { command, description } = resolveBashInput(part)

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-3xl border bg-card text-card-foreground">
        {/* 标题栏：description 居左，Bash 居右 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state="success" />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            {description || 'Bash'}
          </span>
          {description ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Bash</span>
          ) : null}
        </div>

        {/* 命令 */}
        {command ? (
          <div className="border-b bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-muted-foreground">$</span>
              <span className="flex-1 break-all text-foreground">{command}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => void navigator.clipboard.writeText(command)}
              >
                <svg className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}

      </div>
    </div>
  )
}
