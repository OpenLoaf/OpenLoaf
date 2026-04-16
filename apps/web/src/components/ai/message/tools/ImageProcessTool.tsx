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
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, shortPath, EmptyView, FilePathLink } from './shared/office-tool-utils'
import { cn } from '@/lib/utils'
import { fetchBlobFromUri } from '@/lib/image/uri'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'
import type { TFunction } from 'i18next'

type ResultEntry = { label: string; value?: string; fileLink?: string }

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ResultEntries({ entries }: { entries: ResultEntry[] }) {
  if (entries.length === 0) return <EmptyView />
  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{entry.label}</span>
          {entry.fileLink ? (
            <FilePathLink filePath={entry.fileLink} />
          ) : entry.value ? (
            <span className="truncate font-mono text-foreground">{entry.value}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Convert an absolute filesystem path to a project-relative path when possible. */
function toRelativePath(absPath: string, rootUri?: string): string {
  if (!rootUri || !absPath.startsWith('/')) return absPath
  const rootPath = rootUri.startsWith('file://') ? rootUri.slice(7) : rootUri
  const normalized = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
  if (absPath.startsWith(normalized)) return absPath.slice(normalized.length)
  return absPath
}

function ImagePreview({ filePath }: { filePath: string }) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const { projectId, tabId, sessionId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!filePath) return
      const name = filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath
      const entry = createFileEntryFromUri({ uri: filePath, name })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, sessionId, rootUri: projectRootUri })
    },
    [filePath, tabId, projectId, sessionId, projectRootUri],
  )

  React.useEffect(() => {
    let revoked = false
    const resolvedPath = toRelativePath(filePath, projectRootUri)
    fetchBlobFromUri(resolvedPath, { projectId: projectId ?? undefined })
      .then((blob) => {
        if (revoked) return
        setObjectUrl(URL.createObjectURL(blob))
      })
      .catch(() => {})
    return () => {
      revoked = true
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [filePath, projectId, projectRootUri])

  if (!objectUrl) return null
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex cursor-pointer justify-center"
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(e as unknown as React.MouseEvent) }}
    >
      <img
        src={objectUrl}
        alt={shortPath(filePath)}
        className="max-h-[160px] max-w-full rounded border border-border/40 object-contain hover:border-blue-400 transition-colors"
        draggable={false}
      />
    </div>
  )
}

function GetInfoView({ data, t }: { data: Record<string, unknown>; t: TFunction }) {
  const rows: { label: string; value: string }[] = []
  if (typeof data.width === 'number' && typeof data.height === 'number') {
    rows.push({ label: t('tool.imageProcess.dimensions', { defaultValue: '尺寸' }), value: `${data.width} × ${data.height}` })
  }
  if (typeof data.format === 'string') {
    rows.push({ label: t('tool.imageProcess.format', { defaultValue: '格式' }), value: data.format })
  }
  if (typeof data.colorSpace === 'string') {
    rows.push({ label: t('tool.imageProcess.colorSpace', { defaultValue: '色彩空间' }), value: data.colorSpace })
  }
  if (typeof data.channels === 'number') {
    rows.push({ label: t('tool.imageProcess.channels', { defaultValue: '通道' }), value: String(data.channels) })
  }
  if (typeof data.depth === 'string') {
    rows.push({ label: t('tool.imageProcess.depth', { defaultValue: '位深' }), value: data.depth })
  }
  if (typeof data.hasAlpha === 'boolean') {
    rows.push({ label: t('tool.imageProcess.hasAlpha', { defaultValue: '透明通道' }), value: data.hasAlpha ? 'Yes' : 'No' })
  }
  if (typeof data.fileSize === 'number') {
    rows.push({ label: t('tool.imageProcess.fileSize', { defaultValue: '文件大小' }), value: formatFileSize(data.fileSize) })
  }

  if (rows.length === 0) return <EmptyView />

  return (
    <div className="space-y-0.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{row.label}</span>
          <span className="truncate font-mono text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function ProcessResultView({ data, input, t }: { data: Record<string, unknown>; input: Record<string, unknown> | null; t: TFunction }) {
  const outputPath = typeof data.outputPath === 'string' ? data.outputPath : ''
  const action = typeof data.action === 'string' ? data.action : ''
  const entries: ResultEntry[] = []

  if (outputPath) entries.push({ label: t('tool.office.file', { defaultValue: '文件' }), fileLink: outputPath })
  if (typeof data.width === 'number' && typeof data.height === 'number') {
    entries.push({ label: t('tool.imageProcess.dimensions', { defaultValue: '尺寸' }), value: `${data.width} × ${data.height}` })
  }
  if (typeof data.format === 'string') {
    entries.push({ label: t('tool.imageProcess.format', { defaultValue: '格式' }), value: data.format })
  }
  if (typeof data.fileSize === 'number') {
    entries.push({ label: t('tool.imageProcess.fileSize', { defaultValue: '文件大小' }), value: formatFileSize(data.fileSize) })
  }

  const isImage = outputPath && /\.(png|jpe?g|gif|bmp|webp|svg|avif|tiff)$/i.test(outputPath)

  return (
    <div className="space-y-2">
      {isImage && <ImagePreview filePath={outputPath} />}
      <ResultEntries entries={entries} />
    </div>
  )
}

function PendingView({ input, t }: { input: Record<string, unknown>; t: TFunction }) {
  const actionName = typeof input.actionName === 'string' ? input.actionName : typeof input.action === 'string' ? input.action : ''
  const filePath = typeof input.filePath === 'string' ? input.filePath : ''
  const entries: ResultEntry[] = []

  if (filePath) entries.push({ label: t('tool.office.file', { defaultValue: '文件' }), fileLink: filePath })
  if (actionName) entries.push({ label: t('tool.imageProcess.action', { defaultValue: '操作' }), value: actionName })

  const width = typeof input.width === 'number' ? input.width : undefined
  const height = typeof input.height === 'number' ? input.height : undefined
  if (width != null || height != null) {
    const dims = [width ?? '?', height ?? '?'].join(' × ')
    entries.push({ label: t('tool.imageProcess.targetSize', { defaultValue: '目标尺寸' }), value: dims })
  }

  return <ResultEntries entries={entries} />
}

export default function ImageProcessTool({
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
      isMutate={true}
      i18nPrefix="tool.office"
      defaultOpen
    >
      {(ctx) => {
        const { data, input, isPending, isDone, t } = ctx

        if (isPending && input) {
          return <PendingView input={input} t={t} />
        }

        if (data && isDone) {
          const action = typeof data.action === 'string' ? data.action : ''
          if (action === 'get-info') {
            return <GetInfoView data={data} t={t} />
          }
          return <ProcessResultView data={data} input={input} t={t} />
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
