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

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Claude, OpenAI } from '@lobehub/icons'
import { CheckCircle2, Circle } from 'lucide-react'
import { trpc } from '@/utils/trpc'
import { cn } from '@/lib/utils'

type CliToolKind = 'codex' | 'claudeCode' | 'python'

type CliToolStatus = {
  id: CliToolKind
  installed: boolean
  version?: string
}

const CLI_TOOLS_META: {
  id: CliToolKind
  label: string
  description: string
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  iconColor?: string
}[] = [
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'OpenAI Codex CLI',
    icon: OpenAI,
    iconColor: OpenAI.colorPrimary,
  },
  {
    id: 'claudeCode',
    label: 'Claude Code',
    description: 'Anthropic Claude Code',
    icon: Claude.Color,
  },
]

/** Lightweight CLI tools status list for the model preferences panel. */
export function CliToolsList() {
  const { data, isLoading } = useQuery({
    ...trpc.settings.getCliToolsStatus.queryOptions(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const statusMap = useMemo(() => {
    const map: Record<string, CliToolStatus> = {}
    if (data) {
      for (const item of data) {
        map[item.id] = item as CliToolStatus
      }
    }
    return map
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        检测 CLI 工具...
      </div>
    )
  }

  const hasAnyInstalled = CLI_TOOLS_META.some((tool) => statusMap[tool.id]?.installed)

  if (!hasAnyInstalled) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
        <div className="text-xs text-muted-foreground">
          未安装 CLI 工具
        </div>
        <div className="text-[11px] text-muted-foreground/70">
          前往设置 → 第三方工具安装
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1 px-1">
      {CLI_TOOLS_META.map((tool) => {
        const status = statusMap[tool.id]
        const installed = status?.installed ?? false
        const Icon = tool.icon

        return (
          <div
            key={tool.id}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
              installed
                ? 'bg-muted/50'
                : 'opacity-50',
            )}
          >
            <Icon
              size={18}
              className={cn(!installed && 'grayscale')}
              style={tool.iconColor ? { color: tool.iconColor } : undefined}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium leading-tight">
                {tool.label}
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {tool.description}
                {installed && status?.version ? ` · v${status.version}` : ''}
              </div>
            </div>
            {installed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            )}
          </div>
        )
      })}
    </div>
  )
}
