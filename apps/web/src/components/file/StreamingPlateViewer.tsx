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

import { useEffect, useMemo, useRef, useCallback } from 'react'
import { deserializeMd } from '@platejs/markdown'
import { type Value, setValue } from 'platejs'
import { Plate, usePlateEditor } from 'platejs/react'

import { EditorKit } from '@/components/editor/editor-kit'
import { Editor, EditorContainer } from '@openloaf/ui/editor'
import { useChatRuntime } from '@/hooks/use-chat-runtime'

interface StreamingPlateViewerProps {
  toolCallId?: string
  tabId?: string
}

export default function StreamingPlateViewer({
  toolCallId,
  tabId,
}: StreamingPlateViewerProps) {
  // 逻辑：从 toolPartsByTabId 读取 edit-document 工具的实时状态。
  const toolPart = useChatRuntime((s) => {
    if (!tabId || !toolCallId) return undefined
    return s.toolPartsByTabId[tabId]?.[toolCallId]
  })

  const contentRef = useRef('')
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const input = toolPart?.input as
    | { path?: string; content?: string }
    | undefined
  const content = typeof input?.content === 'string' ? input.content : ''
  const toolState = typeof toolPart?.state === 'string' ? toolPart.state : ''

  contentRef.current = content

  const editor = usePlateEditor(
    {
      id: `streaming-plate-${toolCallId ?? 'empty'}`,
      plugins: EditorKit,
      value: [{ type: 'p', children: [{ text: '' }] }],
    },
    [],
  )

  // 逻辑：将 MDX 内容反序列化为 Plate 节点并更新编辑器。
  const applyContentUpdate = useCallback(() => {
    const currentContent = contentRef.current
    if (!currentContent || !editor) return
    try {
      const nodes = deserializeMd(editor, currentContent)
      if (nodes.length > 0) {
        setValue(editor, nodes as Value)
      }
    } catch {
      // 逻辑：流式传输中内容可能不完整，忽略解析错误。
    }
  }, [editor])

  // 逻辑：content 变化时用 throttle 更新编辑器。
  useEffect(() => {
    if (!editor) return
    if (throttleTimerRef.current) return

    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null
      applyContentUpdate()
    }, 80)
  }, [content, applyContentUpdate, editor])

  // 逻辑：状态变为完成时立即刷新确保内容完整。
  useEffect(() => {
    if (
      toolState === 'input-available' ||
      toolState === 'output-available'
    ) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = null
      }
      applyContentUpdate()
    }
  }, [toolState, applyContentUpdate])

  // 逻辑：组件卸载时清理 throttle 定时器。
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current)
      }
    }
  }, [])

  if (!toolCallId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        无效的工具调用
      </div>
    )
  }

  const isStreaming = toolState === 'input-streaming'
  const isDone =
    toolState === 'output-available' || toolState === 'input-available'
  const isError = toolState === 'output-error'

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Plate editor={editor} readOnly>
        <EditorContainer className="h-full">
          <Editor variant="fullWidth" className="h-full" readOnly />
        </EditorContainer>
      </Plate>
      {isStreaming && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          编辑中...
        </div>
      )}
      {isDone && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          已完成
        </div>
      )}
      {isError && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs text-destructive backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
          编辑失败
        </div>
      )}
    </div>
  )
}
