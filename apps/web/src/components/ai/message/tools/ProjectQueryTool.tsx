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
import { FolderOpenIcon, FolderIcon } from 'lucide-react'
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, EmptyView } from './shared/office-tool-utils'
import { cn } from '@/lib/utils'
import type { TFunction } from 'i18next'

type ProjectItem = {
  projectId: string
  title: string
  icon?: string
  rootUri: string
  parentProjectId?: string | null
  depth?: number
}

/* ───── Single project ───── */

function ProjectCard({ project, t }: { project: ProjectItem; t: TFunction }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-base">{project.icon || '📁'}</span>
        <span className="font-medium text-foreground">{project.title}</span>
      </div>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="shrink-0 text-muted-foreground">{t('tool.project.path', { defaultValue: '路径' })}</span>
        <span className="truncate font-mono text-foreground">{project.rootUri}</span>
      </div>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="shrink-0 text-muted-foreground">ID</span>
        <span className="truncate font-mono text-muted-foreground">{project.projectId}</span>
      </div>
    </div>
  )
}

/* ───── Project list ───── */

function ProjectListView({ projects, t }: { projects: ProjectItem[]; t: TFunction }) {
  const [expanded, setExpanded] = React.useState(false)
  const limit = 20
  const visible = expanded ? projects : projects.slice(0, limit)
  const hasMore = projects.length > limit

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FolderOpenIcon className="size-3" />
        <span>{t('tool.project.projects', { defaultValue: '项目列表' })}</span>
        <span className="font-mono">({projects.length})</span>
      </div>
      <div className="max-h-[280px] space-y-0.5 overflow-auto">
        {visible.map((p) => {
          const indent = typeof p.depth === 'number' ? p.depth : 0
          return (
            <div
              key={p.projectId}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
              style={indent > 0 ? { paddingLeft: `${indent * 16 + 8}px` } : undefined}
            >
              <span className="shrink-0 text-sm">{p.icon || '📁'}</span>
              <span className="min-w-0 truncate font-medium text-foreground">{p.title}</span>
              <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                {p.rootUri.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p.rootUri}
              </span>
            </div>
          )
        })}
      </div>
      {hasMore && !expanded && (
        <button
          type="button"
          className="text-[11px] text-ol-blue hover:underline"
          onClick={() => setExpanded(true)}
        >
          {t('tool.project.showAll', { defaultValue: '显示全部', count: projects.length })}
        </button>
      )}
    </div>
  )
}

/* ───── Get single project ───── */

function ProjectGetView({ project, t }: { project: Record<string, unknown>; t: TFunction }) {
  const item: ProjectItem = {
    projectId: typeof project.projectId === 'string' ? project.projectId : '',
    title: typeof project.title === 'string' ? project.title : '',
    icon: typeof project.icon === 'string' ? project.icon : undefined,
    rootUri: typeof project.rootUri === 'string' ? project.rootUri : '',
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FolderIcon className="size-3" />
        <span>{t('tool.project.detail', { defaultValue: '项目详情' })}</span>
      </div>
      <ProjectCard project={item} t={t} />
    </div>
  )
}

/* ───── Router ───── */

function ProjectQueryResultView({ data, t }: { data: Record<string, unknown>; t: TFunction }) {
  const mode = typeof data.mode === 'string' ? data.mode : ''

  if (mode === 'list' && Array.isArray(data.projects)) {
    return <ProjectListView projects={data.projects as ProjectItem[]} t={t} />
  }

  if (mode === 'get' && data.project && typeof data.project === 'object') {
    return <ProjectGetView project={data.project as Record<string, unknown>} t={t} />
  }

  return <EmptyView />
}

export default function ProjectQueryTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-lg', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.office"
      defaultOpen
    >
      {(ctx) => {
        const { data, isDone, t } = ctx

        if (data && isDone) {
          return <ProjectQueryResultView data={data} t={t} />
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
