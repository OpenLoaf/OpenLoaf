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

import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Claude, OpenAI } from '@lobehub/icons'
import { Check } from 'lucide-react'
import { trpc } from '@/utils/trpc'
import { cn } from '@/lib/utils'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'

type CliToolKind = 'codex' | 'claudeCode' | 'python'

type CliToolStatus = {
  id: CliToolKind
  installed: boolean
  version?: string
}

export const CLI_TOOLS_META: {
  id: CliToolKind
  label: string
  description: string
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  iconColor?: string
}[] = [
  {
    id: 'claudeCode',
    label: 'Claude Code',
    description: 'Anthropic Claude Code',
    icon: Claude.Color,
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'OpenAI Codex CLI',
    icon: OpenAI,
  },
]

interface CliToolsListProps {
  selectedId?: string
  onSelect?: (id: string) => void
  onOpenInstall?: () => void
  disabled?: boolean
}

/** Lightweight CLI tools status list for the model preferences panel. */
export function CliToolsList({ selectedId, onSelect, onOpenInstall, disabled }: CliToolsListProps) {
  const { t } = useTranslation('ai')
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

  const installedTools = useMemo(
    () => CLI_TOOLS_META.filter((tool) => statusMap[tool.id]?.installed),
    [statusMap],
  )

  // Auto-select first installed tool when nothing is selected
  useEffect(() => {
    if (!onSelect || disabled) return
    if (selectedId && statusMap[selectedId]?.installed) return
    const first = installedTools[0]
    if (first) onSelect(first.id)
  }, [selectedId, installedTools, onSelect, disabled, statusMap])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        {t('mode.detectingCli')}
      </div>
    )
  }

  if (installedTools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <div className="text-xs text-muted-foreground">
          {t('mode.noCliInstalled')}
        </div>
        {onOpenInstall ? (
          <PromptInputButton
            type="button"
            variant="outline"
            size="sm"
            className="rounded-md px-4"
            onClick={onOpenInstall}
          >
            {t('mode.goInstall')}
          </PromptInputButton>
        ) : (
          <div className="text-[11px] text-muted-foreground/70">
            {t('mode.goSettings')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-0.5', disabled && 'pointer-events-none opacity-60')}>
      {CLI_TOOLS_META.map((tool) => {
        const status = statusMap[tool.id]
        const installed = status?.installed ?? false
        const Icon = tool.icon
        const isSelected = selectedId === tool.id
        const clickable = installed && !disabled && onSelect

        return (
          <div
            key={tool.id}
            role="button"
            tabIndex={!clickable ? -1 : 0}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
              installed
                ? clickable
                  ? 'cursor-pointer hover:bg-sidebar-accent/60'
                  : ''
                : 'pointer-events-none opacity-40',
            )}
            onClick={clickable ? () => onSelect(tool.id) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(tool.id)
                    }
                  }
                : undefined
            }
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <Icon
                  size={14}
                  className={cn('h-3.5 w-3.5 shrink-0', !installed && 'grayscale')}
                  style={tool.iconColor ? { color: tool.iconColor } : undefined}
                  aria-hidden="true"
                />
                <span className="truncate">{tool.label}</span>
              </div>
              <div className="mt-0.5 pl-5.5 text-[11px] text-muted-foreground leading-tight">
                {tool.description}
                {installed && status?.version ? ` · v${status.version}` : ''}
              </div>
            </div>
            {installed && (
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-transparent',
                )}
                tabIndex={-1}
                aria-hidden
              >
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
