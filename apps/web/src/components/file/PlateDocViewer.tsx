'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { deserializeMd, serializeMd } from '@platejs/markdown'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { type Value, setValue } from 'platejs'
import { Plate, usePlateEditor } from 'platejs/react'

import { EditorKit } from '@/components/editor/editor-kit'
import { ReadFileErrorFallback } from '@/components/file/lib/read-file-error'
import { StackHeader } from '@/components/layout/StackHeader'
import { resolveFileUriFromRoot } from '@/components/project/filesystem/utils/file-system-utils'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import { Button } from '@tenas-ai/ui/button'
import { Editor, EditorContainer } from '@tenas-ai/ui/editor'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { requestStackMinimize } from '@/lib/stack-dock-animation'
import { trpc } from '@/utils/trpc'
import { stopFindShortcutPropagation } from '@/components/file/lib/viewer-shortcuts'
import { getDocDisplayName } from '@/lib/file-name'

interface PlateDocViewerProps {
  /** Document folder uri. */
  uri?: string
  /** Path to index.mdx inside the folder. */
  docFileUri?: string
  /** Folder name (with prefix). */
  name?: string
  /** Project id for file access. */
  projectId?: string
  /** Root uri for system open. */
  rootUri?: string
  /** Stack panel key. */
  panelKey?: string
  /** Stack tab id. */
  tabId?: string
}

type DocStatus = 'idle' | 'loading' | 'ready' | 'error'

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
  const initializingRef = useRef(true)
  const removeStackItem = useTabRuntime((s) => s.removeStackItem)
  const shouldRenderStackHeader = Boolean(tabId && panelKey)
  const displayTitle = useMemo(
    () => (name ? getDocDisplayName(name) : uri ?? '文稿'),
    [name, uri],
  )

  // 逻辑：解析 index.mdx 的完整 file:// URI。
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
      plugins: EditorKit,
      value: [{ type: 'p', children: [{ text: '' }] }],
    },
    [uri],
  )

  // 逻辑：文件内容加载后反序列化为 Plate 节点。
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

  const handleValueChange = (_nextValue: Value) => {
    if (initializingRef.current) return
    setIsDirty(true)
  }

  const handleSave = useCallback(async () => {
    if (!readUri || !shouldUseFs || !workspaceId || !editor) return
    try {
      const md = serializeMd(editor)
      await writeFileMutation.mutateAsync({
        workspaceId,
        projectId,
        uri: readUri,
        content: md,
      })
      setIsDirty(false)
      toast.success('已保存')
    } catch {
      toast.error('保存失败')
    }
  }, [readUri, shouldUseFs, workspaceId, editor, projectId, writeFileMutation])

  // 逻辑：Cmd+S 快捷键保存。
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      stopFindShortcutPropagation(event)
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        void handleSave()
      }
    },
    [handleSave],
  )

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文稿</div>
  }

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
              onClick={() => void handleSave()}
              disabled={writeFileMutation.isPending || !isDirty || status !== 'ready'}
              aria-label="保存"
              title="保存"
            >
              <Save className="h-4 w-4" />
            </Button>
          }
          showMinimize
          onMinimize={() => {
            if (!tabId) return
            requestStackMinimize(tabId)
          }}
          onClose={() => {
            if (!tabId || !panelKey) return
            if (isDirty) {
              const ok = window.confirm('当前文稿尚未保存，确定要关闭吗？')
              if (!ok) return
            }
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
