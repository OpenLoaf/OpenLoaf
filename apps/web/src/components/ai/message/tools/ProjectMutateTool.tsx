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
import {
  FolderPlusIcon,
  FolderPenIcon,
  FolderOutputIcon,
  FolderMinusIcon,
  FolderIcon,
  LoaderCircleIcon,
  XCircleIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import { useAppView } from '@/hooks/use-app-view'
import { useLayoutState } from '@/hooks/use-layout-state'
import { getProjectsQueryKey } from '@/hooks/use-projects'
import { queryClient } from '@/utils/trpc'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  asPlainObject,
  getToolOutputState,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
  type ToolVariant,
} from './shared/tool-utils'

type ProjectMutateAction = 'create' | 'update' | 'move' | 'remove'

const ACTION_META: Record<ProjectMutateAction, { icon: typeof FolderIcon; label: string }> = {
  create: { icon: FolderPlusIcon, label: '创建项目' },
  update: { icon: FolderPenIcon, label: '更新项目' },
  move: { icon: FolderOutputIcon, label: '移动项目' },
  remove: { icon: FolderMinusIcon, label: '删除项目' },
}

/** Extract project info from output (best-effort). */
function extractProjectInfo(output: unknown): {
  projectId: string
  title?: string
  icon?: string | null
} | null {
  const normalized = normalizeToolInput(output)
  const root = asPlainObject(normalized)
  if (!root) return null
  const data = asPlainObject(root.data) ?? root
  const project = asPlainObject(data.project) ?? null
  if (!project) {
    const pid = typeof data.projectId === 'string' ? data.projectId.trim() : ''
    return pid ? { projectId: pid } : null
  }
  const projectId = typeof project.projectId === 'string' ? project.projectId.trim() : ''
  if (!projectId) return null
  const title = typeof project.title === 'string' ? project.title : undefined
  const icon =
    typeof project.icon === 'string' || project.icon === null
      ? (project.icon as string | null)
      : undefined
  return { projectId, title, icon }
}

export default function ProjectMutateTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const rawAction = typeof inputObj?.action === 'string' ? inputObj.action : ''
  const action: ProjectMutateAction = (['create', 'update', 'move', 'remove'] as const).includes(
    rawAction as ProjectMutateAction,
  )
    ? (rawAction as ProjectMutateAction)
    : 'update'
  const inputTitle = typeof inputObj?.title === 'string' ? inputObj.title.trim() : ''
  const inputFolder = typeof inputObj?.folderName === 'string' ? inputObj.folderName.trim() : ''
  const inputProjectId =
    typeof inputObj?.projectId === 'string' ? inputObj.projectId.trim() : ''

  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const isDone = part.state === 'output-available' && !hasError
  const { hasErrorText } = getToolOutputState(part)

  const projectInfo = React.useMemo(() => extractProjectInfo(part.output), [part.output])

  // 逻辑：成功完成后刷新项目树 + 同步 app view 元信息（原 ProjectTool 行为）。
  const handledRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
    if (!toolCallId || handledRef.current === toolCallId) return
    if (!isDone || hasErrorText || part.approval?.approved === false) return
    handledRef.current = toolCallId
    queryClient.invalidateQueries({ queryKey: getProjectsQueryKey() })
    if (!projectInfo) return
    const baseId = `project:${projectInfo.projectId}`
    const currentBase = useLayoutState.getState().base
    if (currentBase?.id === baseId) {
      if (projectInfo.title) useAppView.getState().setTitle(projectInfo.title)
      if (projectInfo.icon !== undefined) useAppView.getState().setIcon(projectInfo.icon)
    }
  }, [part.toolCallId, isDone, hasErrorText, part.approval?.approved, projectInfo])

  const meta = ACTION_META[action]
  const ActionIcon = meta.icon
  // 优先用 output 项目名；fallback 到 input 的 title / folderName / projectId。
  const displayName =
    projectInfo?.title ||
    inputTitle ||
    inputFolder ||
    (projectInfo?.projectId
      ? projectInfo.projectId.slice(0, 8)
      : inputProjectId
        ? inputProjectId.slice(0, 8)
        : '')

  const tooltipLines = [
    `${meta.label}${displayName ? `: ${displayName}` : ''}`,
    inputProjectId && `projectId: ${inputProjectId}`,
    inputTitle && `title: ${inputTitle}`,
    inputFolder && `folder: ${inputFolder}`,
  ].filter(Boolean) as string[]

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
          <ActionIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{meta.label}</span>
          {displayName ? (
            <span className="min-w-0 truncate font-mono text-xs text-foreground/70">
              {displayName}
            </span>
          ) : null}
          {streaming ? (
            <LoaderCircleIcon className="ml-auto size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : hasError ? (
            <XCircleIcon className="ml-auto size-3 shrink-0 text-destructive" />
          ) : isDone ? (
            <CheckCircle2Icon className="ml-auto size-3 shrink-0 text-muted-foreground/60" />
          ) : null}
        </div>
      </TooltipTrigger>
      {tooltipLines.length > 0 ? (
        <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-xs">
          {tooltipLines.join('\n')}
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}
