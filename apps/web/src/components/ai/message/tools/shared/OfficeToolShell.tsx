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
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, FileIcon, ExternalLinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import {
  getApprovalId,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  type AnyToolPart,
} from './tool-utils'
import { parseOutput, parseInput, getMode } from './office-tool-utils'
import ToolApprovalActions from './ToolApprovalActions'
import type { TFunction } from 'i18next'

export interface ShellContext {
  data: Record<string, unknown> | null
  input: Record<string, unknown> | null
  mode: string
  isStreaming: boolean
  isDone: boolean
  isPending: boolean
  ok: boolean
  t: TFunction
}

interface OfficeToolShellProps {
  part: AnyToolPart
  className?: string
  toolKind: string
  isMutate: boolean
  /** i18n key prefix for the "processing" / "operationFailed" / "confirmAction" messages */
  i18nPrefix?: string
  /** Whether the content panel should be open by default. */
  defaultOpen?: boolean
  children: (ctx: ShellContext) => React.ReactNode
}

/** Resolve the file path for opening in the stack viewer.
 *  Prefer input.filePath (relative, works with project file API)
 *  over data.filePath (absolute server path, may not resolve in PdfViewer). */
function resolveFilePath(
  data: Record<string, unknown> | null,
  input: Record<string, unknown> | null,
): string {
  if (typeof input?.filePath === 'string' && input.filePath) return input.filePath
  if (typeof data?.filePath === 'string' && data.filePath) return data.filePath
  return ''
}

/** Get a short display name from a file path. */
function resolveDisplayName(filePath: string): string {
  if (!filePath) return ''
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath
}

export default function OfficeToolShell({
  part,
  className,
  toolKind,
  isMutate,
  i18nPrefix = 'tool.office',
  defaultOpen,
  children,
}: OfficeToolShellProps) {
  const { t } = useTranslation('ai')
  const title = getToolName(part)

  const isStreaming = isToolStreaming(part)
  const state = typeof part.state === 'string' ? part.state : ''
  const isDone = state === 'output-available'
  const isError = state === 'output-error'
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : ''

  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)

  const { ok, data, error: outputError } = parseOutput(part)
  const input = parseInput(part)
  const mode = getMode(data, input)

  const displayError = errorText || outputError || (!ok && isDone ? t(`${i18nPrefix}.operationFailed`) : '')

  const windowState = isError || displayError
    ? ('error' as const)
    : isStreaming
      ? ('running' as const)
      : isDone
        ? ('success' as const)
        : ('idle' as const)

  const [isOpen, setIsOpen] = React.useState(defaultOpen ?? isPending)

  React.useEffect(() => {
    if (isPending) setIsOpen(true)
  }, [isPending])

  // File open support
  const filePath = resolveFilePath(data, input)
  const fileDisplayName = resolveDisplayName(filePath)
  const { projectId, tabId, sessionId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const handleOpenFile = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!filePath) return
      const entry = createFileEntryFromUri({ uri: filePath, name: fileDisplayName })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, sessionId, rootUri: projectRootUri })
    },
    [filePath, fileDisplayName, tabId, projectId, sessionId, projectRootUri],
  )

  const ctx: ShellContext = { data, input, mode, isStreaming, isDone, isPending, ok, t }

  const renderContent = () => {
    if (isStreaming) {
      return (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          {t(`${i18nPrefix}.processing`)}
        </div>
      )
    }

    if (displayError) {
      return (
        <div className="px-3 py-3 text-xs text-destructive">
          {displayError}
        </div>
      )
    }

    return <div className="px-3 py-2.5">{children(ctx)}</div>
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-3xl border bg-card text-card-foreground">
        {/* macOS 风格标题栏 */}
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 bg-muted/50 px-3 py-2',
            isOpen && 'border-b',
          )}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <TrafficLights state={windowState} />
          <span className="truncate text-[10px] text-muted-foreground/60">
            {toolKind}
          </span>
          <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
            {title}
          </span>
          <ChevronDownIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180',
            )}
          />
        </button>

        {/* Collapsible content */}
        {isOpen && (
          <>
            {renderContent()}

            {/* File open bar (query only — mutate results have inline FilePathLink) */}
            {filePath && !isPending && !isMutate && (
              <div
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-2 border-t px-3 py-1.5 transition-colors hover:bg-muted/40"
                onClick={handleOpenFile}
                onKeyDown={(e) => { if (e.key === 'Enter') handleOpenFile(e as unknown as React.MouseEvent) }}
              >
                <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {fileDisplayName}
                </span>
                <ExternalLinkIcon className="ml-auto size-3 shrink-0 text-muted-foreground/60" />
              </div>
            )}

            {/* Approval footer */}
            {isMutate && isPending && approvalId ? (
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t px-3 py-2.5">
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t(`${i18nPrefix}.confirmAction`)}
                </span>
                <ToolApprovalActions approvalId={approvalId} size="default" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
