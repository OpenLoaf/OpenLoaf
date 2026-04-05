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
import type { TFunction } from 'i18next'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { EmptyView, FilePathLink, getToolKind } from './shared/office-tool-utils'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'
import { getPreviewEndpoint } from '@/lib/image/uri'
import { ProjectFilePickerDialog } from '@/components/project/filesystem/components/ProjectFilePickerDialog'
import { cn } from '@/lib/utils'
import { trpcClient } from '@/utils/trpc'

type ResultEntry = {
  label: string
  value?: string
  filePath?: string
  href?: string
}

/** Format bytes into a human-readable file size string. */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** Format duration seconds into mm:ss / hh:mm:ss. */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const totalSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
  }

  return [minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

/** Resolve destination label from download result. */
function getDestinationLabel(destination: unknown, t: TFunction): string {
  if (destination === 'board') return t('tool.videoDownload.boardAsset')
  if (destination === 'chat') return t('tool.videoDownload.chatAsset')
  return t('tool.videoDownload.unknownDestination')
}

/** Convert an array buffer to base64 for Electron save dialog. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/** Resolve the suggested file name for the saved video. */
function resolveFileName(data: Record<string, unknown>): string {
  const fileName = typeof data.fileName === 'string' ? data.fileName.trim() : ''
  if (fileName) return fileName

  const title = typeof data.title === 'string' ? data.title.trim() : ''
  const ext = typeof data.ext === 'string' ? data.ext.trim().replace(/^\./, '') : ''
  if (!title) return ext ? `video.${ext}` : 'video.mp4'
  if (!ext || title.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return title
  return `${title}.${ext}`
}

/** Resolve parent folder path for the save dialog default location. */
function resolveParentPath(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (!normalized) return undefined
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex < 0) return ''
  return normalized.slice(0, lastSlashIndex)
}

function ResultEntries({ entries }: { entries: ResultEntry[] }) {
  if (entries.length === 0) return <EmptyView />

  return (
    <div className="space-y-1">
      {entries.map((entry, index) => (
        <div key={`${entry.label}-${index}`} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{entry.label}</span>
          {entry.filePath ? (
            <FilePathLink filePath={entry.filePath} />
          ) : entry.href ? (
            <a
              href={entry.href}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-muted-foreground hover:text-foreground hover:underline"
            >
              {entry.value || entry.href}
            </a>
          ) : entry.value ? (
            <span className="truncate font-mono text-foreground">{entry.value}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function PendingView({
  input,
  t,
}: {
  input: Record<string, unknown>
  t: TFunction
}) {
  const url = typeof input.url === 'string' ? input.url : ''
  if (!url) return <EmptyView />

  return (
    <ResultEntries
      entries={[
        {
          label: t('tool.videoDownload.sourceUrl'),
          value: url,
          href: url,
        },
      ]}
    />
  )
}

function ResultView({
  data,
  t,
  projectRootUri,
}: {
  data: Record<string, unknown>
  t: TFunction
  projectRootUri?: string
}) {
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [isSavingToComputer, setIsSavingToComputer] = React.useState(false)

  const filePath = typeof data.filePath === 'string' ? data.filePath : ''
  const previewProjectId = typeof data.projectId === 'string' ? data.projectId : undefined
  const previewSessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined
  const previewUrl = filePath
    ? getPreviewEndpoint(filePath, { projectId: previewProjectId, sessionId: previewSessionId })
    : ''
  const resolvedFileName = resolveFileName(data)
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : resolvedFileName
  const url = typeof data.url === 'string' ? data.url : ''
  const width = typeof data.width === 'number' ? data.width : 0
  const height = typeof data.height === 'number' ? data.height : 0
  const resolution = width > 0 && height > 0 ? `${width} × ${height}` : ''
  const duration = typeof data.duration === 'number' ? formatDuration(data.duration) : ''
  const format = typeof data.ext === 'string' && data.ext.trim() ? data.ext.toUpperCase() : ''
  const fileSize = typeof data.fileSize === 'number' ? formatFileSize(data.fileSize) : ''
  const defaultActiveUri = React.useMemo(() => resolveParentPath(filePath), [filePath])
  const extension = React.useMemo(() => {
    const explicitExt = typeof data.ext === 'string' ? data.ext.trim().replace(/^\./, '') : ''
    if (explicitExt) return explicitExt
    const fileExt = resolvedFileName.split('.').pop()?.trim()
    return fileExt || 'mp4'
  }, [data.ext, resolvedFileName])

  const handleSaveToComputer = React.useCallback(async () => {
    if (!previewUrl) return
    setIsSavingToComputer(true)
    try {
      const saveFile = window.openloafElectron?.saveFile
      if (saveFile) {
        try {
          const response = await fetch(previewUrl)
          if (!response.ok) throw new Error('download failed')
          const buffer = await response.arrayBuffer()
          const result = await saveFile({
            contentBase64: arrayBufferToBase64(buffer),
            suggestedName: resolvedFileName,
            filters: [{ name: 'Video', extensions: [extension] }],
          })
          if (result?.ok || result?.canceled) return
        } catch {
          // 逻辑：桌面保存失败时回退到浏览器下载，保持和画布一致。
        }
      }

      const link = document.createElement('a')
      link.href = previewUrl
      link.download = resolvedFileName
      link.rel = 'noreferrer'
      link.click()
    } finally {
      setIsSavingToComputer(false)
    }
  }, [extension, previewUrl, resolvedFileName])

  const handleSelectFolder = React.useCallback(async (info: { uri?: string; projectId?: string }) => {
    if (!previewUrl || !resolvedFileName || !info.projectId) return
    try {
      const response = await fetch(previewUrl)
      if (!response.ok) throw new Error('fetch failed')
      const buffer = await response.arrayBuffer()
      const targetUri = info.uri ? `${info.uri}/${resolvedFileName}` : resolvedFileName
      await trpcClient.fs.writeBinary.mutate({
        projectId: info.projectId,
        uri: targetUri,
        contentBase64: arrayBufferToBase64(buffer),
      })
      toast.success(t('project:filesystem.saveConfirmLabel'))
    } catch {
      toast.error(t('project:filesystem.cannotResolvePath'))
    } finally {
      setSaveDialogOpen(false)
    }
  }, [previewUrl, resolvedFileName, t])

  const entries: ResultEntry[] = []
  if (url) {
    entries.push({
      label: t('tool.videoDownload.sourceUrl'),
      value: url,
      href: url,
    })
  }
  entries.push({
    label: t('tool.videoDownload.destination'),
    value: getDestinationLabel(data.destination, t),
  })
  if (filePath) {
    entries.push({
      label: t('tool.office.file'),
      filePath,
    })
  }
  if (title) {
    entries.push({
      label: t('tool.videoDownload.title'),
      value: title,
    })
  }
  if (duration) {
    entries.push({
      label: t('tool.videoDownload.duration'),
      value: duration,
    })
  }
  if (resolution) {
    entries.push({
      label: t('tool.videoDownload.resolution'),
      value: resolution,
    })
  }
  if (format) {
    entries.push({
      label: t('tool.videoDownload.format'),
      value: format,
    })
  }
  if (fileSize) {
    entries.push({
      label: t('tool.videoDownload.fileSize'),
      value: fileSize,
    })
  }

  return (
    <div className="space-y-3">
      {previewUrl ? (
        <div className="overflow-hidden rounded-3xl border border-border/40 bg-black">
          <video
            controls
            preload="metadata"
            src={previewUrl}
            className="max-h-[280px] w-full bg-black object-contain"
          />
        </div>
      ) : null}
      {previewUrl ? (
        <div className="flex justify-end">
          <PromptInputButton
            type="button"
            size="sm"
            variant="outline"
            disabled={isSavingToComputer}
            onClick={() => setSaveDialogOpen(true)}
          >
            {isSavingToComputer ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Download className="size-3" />
            )}
            {t('tool.videoDownload.saveAs')}
          </PromptInputButton>
        </div>
      ) : null}
      <ResultEntries entries={entries} />
      {saveDialogOpen ? (
        <ProjectFilePickerDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          title={t('project:filesystem.saveFileTitle')}
          excludeBoardEntries
          defaultRootUri={projectRootUri}
          defaultActiveUri={defaultActiveUri}
          folderSelectMode
          confirmButtonLabel={t('project:filesystem.saveConfirmLabel')}
          actionButtonLabel={t('project:filesystem.saveToComputer')}
          onImportFromComputer={() => {
            setSaveDialogOpen(false)
            void handleSaveToComputer()
          }}
          onSelectFolder={(info) => void handleSelectFolder(info)}
        />
      ) : null}
    </div>
  )
}

export default function VideoDownloadTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation(['ai', 'project'])
  const { projectId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined
  const toolKind = getToolKind(part)

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-lg', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.videoDownload"
      defaultOpen
    >
      {(ctx) => {
        const { data, input, isDone } = ctx

        if (data && isDone) {
          return <ResultView data={data} t={t} projectRootUri={projectRootUri} />
        }

        if (input) {
          return <PendingView input={input} t={t} />
        }

        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
