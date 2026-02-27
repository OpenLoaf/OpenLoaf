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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { deserializeMd, serializeMd } from '@platejs/markdown'
import { Check, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { type Value, setValue } from 'platejs'
import { Plate, usePlateEditor } from 'platejs/react'

import { EditorKit } from '@/components/editor/editor-kit'
import { FixedToolbarKit } from '@/components/editor/plugins/fixed-toolbar-kit'
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit'
import { ReadFileErrorFallback } from '@/components/file/lib/read-file-error'
import { StackHeader } from '@/components/layout/StackHeader'
import { resolveFileUriFromRoot } from '@/components/project/filesystem/utils/file-system-utils'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import { Button } from '@openloaf/ui/button'
import { Editor, EditorContainer } from '@openloaf/ui/editor'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { requestStackMinimize } from '@/lib/stack-dock-animation'
import { trpc } from '@/utils/trpc'
import { stopFindShortcutPropagation } from '@/components/file/lib/viewer-shortcuts'
import { getDocDisplayName } from '@/lib/file-name'

const AUTO_SAVE_DELAY = 1500

interface PlateDocViewerProps {
  uri?: string
  docFileUri?: string
  name?: string
  projectId?: string
  rootUri?: string
  panelKey?: string
  tabId?: string
}

type DocStatus = 'idle' | 'loading' | 'ready' | 'error'
type SaveIndicator = 'idle' | 'saving' | 'saved'

export default function PlateDocViewer({
  uri,
  docFileUri,
  name,
  projectId,
  rootUri,
  panelKey,
  tabId,
}: PlateDocViewerProps) {
  const { workspace } = useWorkspace()
  const workspaceId = workspace?.id ?? ''
  const [status, setStatus] = useState<DocStatus>('idle')
  const [isDirty, setIsDirty] = useState(false)
  const [saveIndicator, setSaveIndicator] = useState<SaveIndicator>('idle')
  const initializingRef = useRef(true)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeStackItem = useTabRuntime((s) => s.removeStackItem)
  const shouldRenderStackHeader = Boolean(tabId && panelKey)
  const displayTitle = useMemo(
    () => (name ? getDocDisplayName(name) : uri ?? '文稿'),
    [name, uri],
  )

  const readUri = useMemo(() => {
    const raw = (docFileUri ?? '').trim()
    if (!raw) return ''
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)
    if (hasScheme) return raw
    if (!rootUri?.startsWith('file://')) return raw
    return resolveFileUriFromRoot(rootUri, raw) || raw
  }, [rootUri, docFileUri])

  const shouldUseFs =
    Boolean(readUri) &&
    (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(readUri) || readUri.startsWith('file://'))

  const fileQuery = useQuery({
    ...trpc.fs.readFile.queryOptions({
      workspaceId,
      projectId,
      uri: readUri,
    }),
    enabled: shouldUseFs && Boolean(readUri) && Boolean(workspaceId),
  })

  const writeFileMutation = useMutation(trpc.fs.writeFile.mutationOptions())

  const editor = usePlateEditor(
    {
      id: `plate-doc-${uri ?? 'empty'}`,
      plugins: [...EditorKit, ...FixedToolbarKit, ...FloatingToolbarKit],
      value: [{ type: 'p', children: [{ text: '' }] }],
    },
    [uri],
  )

  useEffect(() => {
    if (!shouldUseFs || !editor) return
    if (fileQuery.isLoading) return
    if (fileQuery.isError) {
      setStatus('error')
      initializingRef.current = false
      return
    }
    const content = fileQuery.data?.content
    if (content == null) {
      setStatus('error')
      initializingRef.current = false
      return
    }
    setStatus('loading')
    initializingRef.current = true
    try {
      const nodes = deserializeMd(editor, content)
      setValue(editor, (nodes.length > 0 ? nodes : [{ type: 'p', children: [{ text: '' }] }]) as Value)
      setIsDirty(false)
      setStatus('ready')
    } catch (err) {
      console.error('[PlateDocViewer] deserialize failed', err)
      setStatus('error')
    } finally {
      initializingRef.current = false
    }
  }, [editor, fileQuery.data?.content, fileQuery.isError, fileQuery.isLoading, shouldUseFs])

  // 逻辑：静默保存（自动保存用），不弹 toast。
  const doSave = useCallback(async (silent = false) => {
    if (!readUri || !shouldUseFs || !workspaceId || !editor) return
    setSaveIndicator('saving')
    try {
      const md = serializeMd(editor)
      await writeFileMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: readUri,
        content: md,
      })
      setIsDirty(false)
      setSaveIndicator('saved')
      if (!silent) toast.success('已保存')
      // 逻辑：短暂显示"已保存"后恢复空闲状态。
      setTimeout(() => setSaveIndicator('idle'), 2000)
    } catch {
      setSaveIndicator('idle')
      if (!silent) toast.error('保存失败')
    }
  }, [readUri, shouldUseFs, workspaceId, editor, projectId, writeFileMutation])

  const handleValueChange = useCallback((_nextValue: Value) => {
    if (initializingRef.current) return
    setIsDirty(true)
  }, [])

  // 逻辑：内容变更后延迟自动保存。
  useEffect(() => {
    if (!isDirty || status !== 'ready') return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      void doSave(true)
    }, AUTO_SAVE_DELAY)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [isDirty, status, doSave])

  // 逻辑：组件卸载时立即保存未写入的变更。
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      stopFindShortcutPropagation(event)
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        void doSave(false)
      }
    },
    [doSave],
  )

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文稿</div>
  }

  const saveIcon =
    saveIndicator === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> :
    saveIndicator === 'saved' ? <Check className="h-4 w-4 text-green-500" /> :
    <Save className="h-4 w-4" />

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" onKeyDown={handleKeyDown}>
      {shouldRenderStackHeader ? (
        <StackHeader
          title={displayTitle}
          openUri={docFileUri ?? uri}
          openRootUri={rootUri}
          rightSlot={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void doSave(false)}
              disabled={writeFileMutation.isPending || !isDirty || status !== 'ready'}
              aria-label="保存"
              title="保存"
            >
              {saveIcon}
            </Button>
          }
          showMinimize
          onMinimize={() => {
            if (!tabId) return
            requestStackMinimize(tabId)
          }}
          onClose={() => {
            if (!tabId || !panelKey) return
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
            if (isDirty) void doSave(true)
            removeStackItem(tabId, panelKey)
          }}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!shouldUseFs ? (
          <ReadFileErrorFallback
            uri={uri}
            name={name}
            projectId={projectId}
            rootUri={rootUri}
            message="暂不支持此地址"
            description="请使用本地文件路径或下载后查看。"
            className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm"
          />
        ) : null}
        {(status === 'loading' || fileQuery.isLoading) ? (
          <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            加载中…
          </div>
        ) : null}
        {(status === 'error' || fileQuery.isError) ? (
          <ReadFileErrorFallback
            uri={uri}
            name={name}
            projectId={projectId}
            rootUri={rootUri}
            error={fileQuery.error ?? undefined}
            message="文稿加载失败"
            description="请检查文件格式或权限后重试。"
            className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <Plate
            editor={editor}
            onValueChange={({ value }) => handleValueChange(value)}
          >
            <EditorContainer className="h-full">
              <Editor variant="fullWidth" className="h-full" />
            </EditorContainer>
          </Plate>
        </div>
      </div>
    </div>
  )
}
