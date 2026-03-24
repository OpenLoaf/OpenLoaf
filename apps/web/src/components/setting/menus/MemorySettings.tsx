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

import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Brain, FileText, FolderOpen, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@openloaf/ui/alert-dialog'
import { OpenLoafSettingsGroup } from '@openloaf/ui/openloaf/OpenLoafSettingsGroup'
import { OpenLoafSettingsCard } from '@openloaf/ui/openloaf/OpenLoafSettingsCard'
import { trpc } from '@/utils/trpc'
import { cn } from '@/lib/utils'

const CodeViewer = lazy(() => import('@/components/file/CodeViewer'))

/** MEMORY.md index file name. */
const MEMORY_INDEX = 'MEMORY.md'

type MemoryFileEntry = {
  uri: string
  name: string
  kind: 'file' | 'folder'
}

type MemoryEditorProps = {
  scope: 'user' | 'project'
  projectId?: string
}

/** Memory settings panel — file list + inline editor. */
const MemoryEditor = memo(function MemoryEditor({ scope, projectId }: MemoryEditorProps) {
  const { t } = useTranslation(['settings', 'common'])
  const queryClient = useQueryClient()

  const dirUriQuery = useQuery({
    ...trpc.settings.getMemoryDirUri.queryOptions({ scope, projectId }),
  })
  const { dirUri, indexUri } = dirUriQuery.data ?? {}

  // List files in memory directory.
  const listQuery = useQuery({
    ...trpc.fs.list.queryOptions({
      projectId: scope === 'project' ? projectId : undefined,
      uri: dirUri ?? '',
      includeHidden: false,
      sort: { field: 'name', order: 'asc' },
    }),
    enabled: Boolean(dirUri),
  })

  // Build file list: always include MEMORY.md at the top, even if it doesn't exist.
  const files = useMemo<MemoryFileEntry[]>(() => {
    const entries = listQuery.data?.entries ?? []
    const fileEntries: MemoryFileEntry[] = entries
      .filter((e) => e.kind === 'file')
      .map((e) => ({ uri: e.uri, name: e.name, kind: 'file' as const }))

    const hasIndex = fileEntries.some((f) => f.name === MEMORY_INDEX)
    if (!hasIndex && indexUri) {
      fileEntries.unshift({ uri: indexUri, name: MEMORY_INDEX, kind: 'file' })
    }

    // Sort: MEMORY.md first, then alphabetical.
    fileEntries.sort((a, b) => {
      if (a.name === MEMORY_INDEX) return -1
      if (b.name === MEMORY_INDEX) return 1
      return a.name.localeCompare(b.name)
    })
    return fileEntries
  }, [listQuery.data?.entries, indexUri])

  const [selectedUri, setSelectedUri] = useState<string | null>(null)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  // Auto-select MEMORY.md on first load.
  const effectiveSelectedUri = selectedUri ?? indexUri ?? files[0]?.uri ?? null
  const selectedFile = files.find((f) => f.uri === effectiveSelectedUri) ?? null

  const handleSelect = useCallback((file: MemoryFileEntry) => {
    setSelectedUri(file.uri)
  }, [])

  const canOpenFolder = Boolean(dirUri && window.openloafElectron?.openPath)

  const handleOpenFolder = useCallback(() => {
    if (dirUri) {
      window.openloafElectron?.openPath?.({ uri: dirUri })
    }
  }, [dirUri])

  // Clear all memory mutation.
  const clearAllMemory = useMutation({
    ...trpc.settings.clearAllMemory.mutationOptions(),
    onSuccess: () => {
      setSelectedUri(null)
      setClearConfirmOpen(false)
      // Refresh file list.
      void queryClient.invalidateQueries({
        queryKey: trpc.fs.list.queryKey(),
      })
    },
  })

  const handleClearAll = useCallback(() => {
    clearAllMemory.mutate({ scope, projectId })
  }, [clearAllMemory, scope, projectId])

  const hasFiles = files.length > 0 && !listQuery.isLoading

  return (
    <>
      <OpenLoafSettingsGroup
        title={t('settings:memory.title')}
        subtitle={scope === 'project' ? t('settings:memory.subtitleProject') : t('settings:memory.subtitle')}
        icon={<Brain className="h-4 w-4 text-foreground" />}
        showBorder={false}
        action={
          <div className="flex items-center gap-1">
            {hasFiles ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-3xl px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setClearConfirmOpen(true)}
                title={t('settings:memory.clearAll')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {canOpenFolder ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-3xl px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground"
                onClick={handleOpenFolder}
                title={t('settings:memory.openFolder')}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3">
          {/* File list */}
          <OpenLoafSettingsCard padding="none">
            <div className="max-h-[200px] overflow-auto">
              {dirUriQuery.isLoading || listQuery.isLoading ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  {t('settings:memory.loading')}
                </div>
              ) : files.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  {t('settings:memory.empty')}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {files.map((file) => (
                    <li key={file.uri}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors duration-150',
                          effectiveSelectedUri === file.uri
                            ? 'bg-secondary text-foreground'
                            : 'text-foreground hover:bg-muted/50',
                        )}
                        onClick={() => handleSelect(file)}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate font-mono">{file.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </OpenLoafSettingsCard>

          {/* File editor */}
          <OpenLoafSettingsCard padding="none">
            <div className="h-[400px] overflow-hidden">
              {selectedFile ? (
                <Suspense fallback={null}>
                  <CodeViewer
                    key={selectedFile.uri}
                    uri={selectedFile.uri}
                    name={selectedFile.name}
                    ext="md"
                    rootUri={dirUri}
                    projectId={scope === 'project' ? projectId : undefined}
                    readOnly={false}
                    hidePlaceholder
                  />
                </Suspense>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  {t('settings:memory.empty')}
                </div>
              )}
            </div>
          </OpenLoafSettingsCard>
        </div>
      </OpenLoafSettingsGroup>

      {/* Clear all memory confirmation dialog */}
      <AlertDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!open && clearAllMemory.isPending) return
          setClearConfirmOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings:memory.clearAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings:memory.clearAllDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearAllMemory.isPending}>
              {t('common:cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                handleClearAll()
              }}
              disabled={clearAllMemory.isPending}
            >
              {clearAllMemory.isPending
                ? t('settings:memory.clearing')
                : t('settings:memory.confirmClear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

/** Global memory settings page (scope=user). */
export function MemorySettings() {
  return <MemoryEditor scope="user" />
}

/** Project memory settings page (scope=project). */
export function ProjectMemorySettings({ projectId }: { projectId?: string; rootUri?: string }) {
  return <MemoryEditor scope="project" projectId={projectId} />
}
