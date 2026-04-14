/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * CloudModelGenerateTool — renders cloud media generation results.
 *
 * Handles two shapes of output:
 *   - Successful sync mode: `files[]` with local filePath (preview via fetchBlobFromUri)
 *   - Failed/async mode: `pendingUrls[]` with remote URLs (direct <img>/<video> src)
 *
 * Pattern mirrors ImageProcessTool — OfficeToolShell for the outer container,
 * custom preview grid inside.
 */
'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, shortPath, EmptyView, FilePathLink, parseOutput } from './shared/office-tool-utils'
import { fetchBlobFromUri } from '@/lib/image/uri'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'
import { ProjectFilePickerDialog } from '@/components/project/filesystem/components/ProjectFilePickerDialog'
import { trpcClient } from '@/utils/trpc'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@openloaf/ui/context-menu'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------

type SavedFile = {
  filePath: string
  absolutePath?: string
  fileName?: string
  sourceUrl?: string
  fileSize?: number
}

type MediaKind = 'image' | 'video' | 'audio' | 'other'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|tiff?)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi)$/i
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i

function detectMediaKind(filePathOrUrl: string): MediaKind {
  if (IMAGE_EXT.test(filePathOrUrl)) return 'image'
  if (VIDEO_EXT.test(filePathOrUrl)) return 'video'
  if (AUDIO_EXT.test(filePathOrUrl)) return 'audio'
  return 'other'
}

function toRelativePath(absPath: string, rootUri?: string): string {
  if (!rootUri || !absPath.startsWith('/')) return absPath
  const rootPath = rootUri.startsWith('file://') ? rootUri.slice(7) : rootUri
  const normalized = rootPath.endsWith('/') ? rootPath : `${rootPath}/`
  if (absPath.startsWith(normalized)) return absPath.slice(normalized.length)
  return absPath
}

/** Coerce possibly-unknown array into a typed SavedFile[]. */
function coerceFiles(value: unknown): SavedFile[] {
  if (!Array.isArray(value)) return []
  const out: SavedFile[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const filePath = typeof record.filePath === 'string' ? record.filePath : ''
    if (!filePath) continue
    out.push({
      filePath,
      absolutePath:
        typeof record.absolutePath === 'string' ? record.absolutePath : undefined,
      fileName: typeof record.fileName === 'string' ? record.fileName : undefined,
      sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : undefined,
      fileSize: typeof record.fileSize === 'number' ? record.fileSize : undefined,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Local file preview — fetchBlobFromUri pattern matching ImageProcessTool
// ---------------------------------------------------------------------------

function LocalMediaPreview({ file, kind }: { file: SavedFile; kind: MediaKind }) {
  const { t } = useTranslation('ai')
  const { t: tProject } = useTranslation('project')
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const { sessionId, projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const suggestedName = React.useMemo(() => {
    if (file.fileName?.trim()) return file.fileName.trim()
    const base = file.filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop()
    return base ?? 'download'
  }, [file.fileName, file.filePath])
  const extension = React.useMemo(() => {
    const match = suggestedName.match(/\.([a-zA-Z0-9]+)$/)
    return match?.[1]?.toLowerCase() ?? 'bin'
  }, [suggestedName])

  const handleClick = React.useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation()
      if (!file.filePath) return
      // FilePreview 走 fs.readBinary，没有 sessionId 无法展开 ${CURRENT_CHAT_DIR}。
      // 优先用后端返回的 absolutePath 构造 file:// URI —— resolveScopedPath 支持
      // file: 协议直接解析成真实路径。
      const openUri = file.absolutePath
        ? `file://${file.absolutePath}`
        : file.filePath
      const name = file.fileName ?? shortPath(file.filePath)
      const entry = createFileEntryFromUri({ uri: openUri, name })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, rootUri: projectRootUri })
    },
    [file.filePath, file.absolutePath, file.fileName, tabId, projectId, projectRootUri],
  )

  const handleSaveToComputer = React.useCallback(async () => {
    if (!objectUrl) return
    setIsSaving(true)
    try {
      const saveFile = window.openloafElectron?.saveFile
      const response = await fetch(objectUrl)
      if (!response.ok) throw new Error('fetch failed')
      const buffer = await response.arrayBuffer()
      if (saveFile) {
        const result = await saveFile({
          contentBase64: arrayBufferToBase64(buffer),
          suggestedName,
          filters: [{ name: kind, extensions: [extension] }],
        })
        if (result?.ok || result?.canceled) return
      }
      // 非 electron 或保存失败：回退到浏览器下载。
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = suggestedName
      link.rel = 'noreferrer'
      link.click()
    } catch {
      toast.error(tProject('filesystem.cannotResolvePath'))
    } finally {
      setIsSaving(false)
    }
  }, [objectUrl, suggestedName, kind, extension, tProject])

  const handleSelectFolder = React.useCallback(
    async (info: { uri?: string; projectId?: string }) => {
      if (!objectUrl || !info.projectId) {
        setSaveDialogOpen(false)
        return
      }
      setIsSaving(true)
      try {
        const response = await fetch(objectUrl)
        if (!response.ok) throw new Error('fetch failed')
        const buffer = await response.arrayBuffer()
        const targetUri = info.uri ? `${info.uri}/${suggestedName}` : suggestedName
        await trpcClient.fs.writeBinary.mutate({
          projectId: info.projectId,
          uri: targetUri,
          contentBase64: arrayBufferToBase64(buffer),
        })
        toast.success(tProject('filesystem.saveConfirmLabel'))
      } catch {
        toast.error(tProject('filesystem.cannotResolvePath'))
      } finally {
        setIsSaving(false)
        setSaveDialogOpen(false)
      }
    },
    [objectUrl, suggestedName, tProject],
  )

  React.useEffect(() => {
    let revoked = false
    // The cloud tool returns filePath as `${CURRENT_CHAT_DIR}/...`. The backend
    // preview endpoint only expands that template when sessionId is provided.
    const resolvedPath = toRelativePath(file.filePath, projectRootUri)
    fetchBlobFromUri(resolvedPath, {
      projectId: projectId ?? undefined,
      sessionId: sessionId ?? undefined,
    })
      .then((blob) => {
        if (revoked) return
        setObjectUrl(URL.createObjectURL(blob))
      })
      .catch(() => {
        // Silent: the <FilePathLink> row still shows the path for manual access.
      })
    return () => {
      revoked = true
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [file.filePath, projectId, projectRootUri, sessionId])

  if (!objectUrl) {
    return (
      <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
        {t('tool.cloud.loading')}
      </div>
    )
  }

  const renderMedia = () => {
    if (kind === 'image') {
      return (
        <img
          src={objectUrl}
          alt={file.fileName ?? shortPath(file.filePath)}
          className="max-h-[320px] max-w-full cursor-pointer object-contain"
          draggable={false}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleClick(e)
          }}
        />
      )
    }
    if (kind === 'video') {
      return (
        <video
          controls
          preload="metadata"
          src={objectUrl}
          className="max-h-[320px] max-w-full object-contain"
        />
      )
    }
    if (kind === 'audio') {
      // biome-ignore lint/a11y/useMediaCaption: user-generated audio has no caption track
      return <audio controls preload="metadata" src={objectUrl} className="w-full" />
    }
    return <FilePathLink filePath={file.filePath} />
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="inline-block">{renderMedia()}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={isSaving}
            onSelect={() => setSaveDialogOpen(true)}
          >
            {t('tool.cloud.saveAs')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {saveDialogOpen ? (
        <ProjectFilePickerDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          title={tProject('filesystem.saveFileTitle')}
          excludeBoardEntries
          defaultRootUri={projectRootUri}
          folderSelectMode
          confirmButtonLabel={tProject('filesystem.saveConfirmLabel')}
          actionButtonLabel={tProject('filesystem.saveToComputer')}
          onImportFromComputer={() => {
            setSaveDialogOpen(false)
            void handleSaveToComputer()
          }}
          onSelectFolder={(info) => void handleSelectFolder(info)}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Remote URL preview (fallback when auto-save failed / pending URLs)
// ---------------------------------------------------------------------------

function RemoteMediaPreview({ url, kind }: { url: string; kind: MediaKind }) {
  if (kind === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="flex justify-center">
        <img
          src={url}
          alt="saas-result"
          className="max-h-[240px] max-w-full rounded border border-border/40 object-contain"
          draggable={false}
        />
      </a>
    )
  }
  if (kind === 'video') {
    return (
      <div className="overflow-hidden rounded border border-border/40 bg-black">
        <video
          controls
          preload="metadata"
          src={url}
          className="max-h-[280px] w-full bg-black object-contain"
        />
      </div>
    )
  }
  if (kind === 'audio') {
    return (
      <div className="rounded border border-border/40 bg-muted/20 px-2 py-2">
        {/* biome-ignore lint/a11y/useMediaCaption: user-generated audio has no caption track */}
        <audio controls preload="metadata" src={url} className="w-full" />
      </div>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
    >
      {url}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Pending view — only used by the shell for non-success states (generating /
// awaiting approval). Success state renders bare media and skips the shell.
// ---------------------------------------------------------------------------

function PendingView({
  input,
  t,
}: {
  input: Record<string, unknown>
  t: TFunction
}) {
  const hasPrompt =
    input.inputs && typeof input.inputs === 'object' && input.inputs !== null
      ? (input.inputs as Record<string, unknown>).prompt
      : undefined
  const promptText = typeof hasPrompt === 'string' ? hasPrompt : ''
  if (!promptText) return <EmptyView />
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{t('tool.cloud.prompt')}</div>
      <div className="rounded bg-muted/30 px-2 py-1 text-xs font-mono text-foreground">
        {promptText.length > 200 ? `${promptText.slice(0, 200)}…` : promptText}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function CloudModelGenerateTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const toolKind = getToolKind(part)

  // 成功态：完全绕过 shell 外壳（无红绿灯、无标题栏、无边框），只渲染媒体。
  // 其他状态（审批待处理 / 生成中 / 失败）仍走 shell 以保留审批入口和错误文案。
  if (part.state === 'output-available') {
    const { ok, data } = parseOutput(part)
    if (ok && data) {
      const files = coerceFiles(data.files)
      const pendingUrls = Array.isArray(data.pendingUrls)
        ? data.pendingUrls.filter((u): u is string => typeof u === 'string')
        : []
      if (files.length > 0 || pendingUrls.length > 0) {
        return (
          <div className={cn('max-w-xl space-y-2', className)}>
            {files.map((file) => {
              const kind = detectMediaKind(file.filePath)
              return <LocalMediaPreview key={file.filePath} file={file} kind={kind} />
            })}
            {pendingUrls.map((url) => {
              const kind = detectMediaKind(url)
              return <RemoteMediaPreview key={url} url={url} kind={kind} />
            })}
          </div>
        )
      }
    }
  }

  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-xl', className)}
      toolKind={toolKind}
      isMutate={true}
      i18nPrefix="tool.cloud"
      defaultOpen
    >
      {(ctx) => {
        const { input } = ctx
        if (input) {
          return <PendingView input={input} t={t} />
        }
        return <EmptyView />
      }}
    </OfficeToolShell>
  )
}
