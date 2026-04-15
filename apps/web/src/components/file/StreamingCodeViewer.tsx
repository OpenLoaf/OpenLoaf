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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import { cn } from '@/lib/utils'
import { trpcClient } from '@/utils/trpc'
import { extractPatchFileInfo, detectLanguageFromPath } from '@/lib/chat/patch-utils'
import {
  parsePatch,
  computeReplacements,
  applyReplacements,
} from '@/lib/chat/apply-patch'

const MONACO_THEME_DARK = 'openloaf-dark'
const MONACO_THEME_LIGHT = 'vs'

const DARK_THEME_COLORS: Monaco.editor.IColors = {
  'editor.background': '#0c1118',
  'editor.foreground': '#e6e6e6',
  'editorLineNumber.foreground': '#6b7280',
  'editorLineNumber.activeForeground': '#e5e7eb',
  'editorGutter.background': '#0c1118',
  'editor.selectionBackground': '#1f3a5f',
  'editor.inactiveSelectionBackground': '#19293f',
  'editor.selectionHighlightBackground': '#1b2a40',
  'editorCursor.foreground': '#e6e6e6',
}

function applyMonacoTheme(monaco: typeof Monaco, themeName: string) {
  if (themeName === MONACO_THEME_DARK) {
    monaco.editor.defineTheme(MONACO_THEME_DARK, {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: DARK_THEME_COLORS,
    })
  }
  monaco.editor.setTheme(themeName)
}

/** 计算变更行的装饰 */
function computeChangedLineDecorations(
  monacoInstance: typeof Monaco,
  changedLines: Set<number>,
): Monaco.editor.IModelDeltaDecoration[] {
  const decorations: Monaco.editor.IModelDeltaDecoration[] = []
  for (const lineNum of changedLines) {
    decorations.push({
      range: new monacoInstance.Range(lineNum, 1, lineNum, 1),
      options: {
        isWholeLine: true,
        className: 'diff-line-added',
        linesDecorationsClassName: 'diff-gutter-added',
      },
    })
  }
  return decorations
}

interface StreamingCodeViewerProps {
  toolCallId?: string
  toolCallIds?: string[]
  tabId?: string
  projectId?: string
}

export default function StreamingCodeViewer({
  toolCallId,
  toolCallIds,
  tabId,
  projectId,
}: StreamingCodeViewerProps) {
  const { t } = useTranslation('common')
  // 逻辑：兼容单值和数组，合并为统一的 allToolCallIds。
  const allToolCallIds = useMemo(() => {
    if (toolCallIds?.length) return toolCallIds
    if (toolCallId) return [toolCallId]
    return []
  }, [toolCallIds, toolCallId])

  // 逻辑：selector 只返回 string（按值比较），避免 upsertToolPart 创建新对象引用导致无限重渲染。
  // string 变化时再命令式读取实际数据。
  const toolPartsKey = useChatRuntime((s) => {
    if (!tabId || allToolCallIds.length === 0) return ''
    const tabParts = s.toolPartsByTabId[tabId]
    if (!tabParts) return ''
    return allToolCallIds.map((id) => {
      const tp = tabParts[id]
      if (!tp) return `${id}:-`
      const st = typeof tp.state === 'string' ? tp.state : ''
      const input = tp.input as Record<string, unknown> | undefined
      const pLen = typeof input?.patch === 'string' ? input.patch.length : 0
      const fpLen = typeof input?.file_path === 'string' ? input.file_path.length : 0
      const cLen = typeof input?.content === 'string' ? input.content.length : 0
      return `${id}:${st}:${pLen}:${fpLen}:${cLen}`
    }).join('|')
  })

  // 逻辑：key 变化时命令式读取 store，聚合所有 toolPart 的 patch 和状态。
  const aggregated = useMemo(() => {
    const patches: string[] = []
    let anyStreaming = false
    let allDone = allToolCallIds.length > 0
    let hasError = false
    if (toolPartsKey && tabId) {
      const tabParts = useChatRuntime.getState().toolPartsByTabId[tabId]
      if (tabParts) {
        for (const id of allToolCallIds) {
          const tp = tabParts[id]
          const input = tp?.input as Record<string, unknown> | undefined
          // 逻辑：兼容 apply-patch（patch 字段）和 Edit/Write（file_path + old_string/new_string 或 content）
          const p = typeof input?.patch === 'string' ? input.patch : ''
          if (p) patches.push(p)
          // 逻辑：Edit/Write 工具没有 patch 字段，构造伪 patch 供路径提取和内容渲染。
          if (!p && typeof input?.file_path === 'string') {
            // 逻辑：Write 工具有 content → 嵌入 content，标记为 Write；Edit 工具无完整内容 → 仅记录路径。
            if (typeof input?.content === 'string') {
              const writeMarker = `*** Write ${input.file_path}\n${input.content}`
              patches.push(writeMarker)
            } else {
              const editMarker = `*** Edit ${input.file_path}\n`
              patches.push(editMarker)
            }
          }
          const st = typeof tp?.state === 'string' ? tp.state : ''
          if (st === 'input-streaming' || st === 'output-streaming') anyStreaming = true
          if (st !== 'input-available' && st !== 'output-available' && st !== 'output-error') allDone = false
          if (st === 'output-error') hasError = true
        }
      }
    }
    return { patches, anyStreaming, allDone, hasError }
  }, [toolPartsKey, tabId, allToolCallIds])

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const decorationIdsRef = useRef<string[]>([])
  // 逻辑：用 ref 存储最新 displayContent，供 onMount 回调读取（避免闭包捕获旧值）。
  const contentRef = useRef('')

  const { patches, anyStreaming: isStreaming, allDone: isDone, hasError: isError } = aggregated
  // 逻辑：用第一个 patch 提取文件路径（所有 patch 应为同一文件）。
  const combinedPatch = patches[0] ?? ''

  // 逻辑：从 patch 文本或 Edit/Write 标记提取文件路径。
  const { firstPath } = useMemo(() => {
    // 兼容 Edit 工具的特殊标记
    if (combinedPatch.startsWith('*** Edit ')) {
      const fp = combinedPatch.slice('*** Edit '.length).trim()
      return { firstPath: fp, fileName: fp.split('/').pop() || fp }
    }
    // 兼容 Write 工具的特殊标记（首行含路径，后续为 content）
    if (combinedPatch.startsWith('*** Write ')) {
      const nl = combinedPatch.indexOf('\n')
      const header = nl >= 0 ? combinedPatch.slice('*** Write '.length, nl) : combinedPatch.slice('*** Write '.length)
      const fp = header.trim()
      return { firstPath: fp, fileName: fp.split('/').pop() || fp }
    }
    return extractPatchFileInfo(combinedPatch)
  }, [combinedPatch])
  const languageId = firstPath ? detectLanguageFromPath(firstPath) : 'plaintext'

  // 逻辑：读取原文件内容。null = 未加载，string = 已加载。
  const [originalContent, setOriginalContent] = useState<string | null>(null)
  const [loadingOriginal, setLoadingOriginal] = useState(false)
  const fetchedPathRef = useRef('')

  useEffect(() => {
    // 逻辑：流式期间路径不完整，延迟到流结束后再读取原文件。
    if (isStreaming) return
    if (!firstPath || fetchedPathRef.current === firstPath) return
    fetchedPathRef.current = firstPath
    setLoadingOriginal(true)
    trpcClient.fs.readFile
      .query({ projectId, uri: firstPath })
      .then((res) => setOriginalContent(res.content))
      .catch(() => setOriginalContent(''))
      .finally(() => setLoadingOriginal(false))
  }, [firstPath, projectId, isStreaming])

  const { resolvedTheme } = useTheme()
  const monacoThemeName = resolvedTheme === 'dark' ? MONACO_THEME_DARK : MONACO_THEME_LIGHT

  // 逻辑：完成后顺序应用所有 patch，累计变更行号。
  const patchResult = useMemo(() => {
    if (!isDone || patches.length === 0) return null
    try {
      let currentLines = (originalContent ?? '').split('\n')
      const changedLines = new Set<number>()
      let isAdd = false
      let isDelete = false

      for (const pText of patches) {
        // 逻辑：Write 工具的伪 patch（*** Write path\n<content>），直接作为整文件内容。
        if (pText.startsWith('*** Write ')) {
          const nl = pText.indexOf('\n')
          const content = nl >= 0 ? pText.slice(nl + 1) : ''
          currentLines = content.split('\n')
          isAdd = true
          changedLines.clear()
          for (let i = 1; i <= currentLines.length; i++) changedLines.add(i)
          continue
        }
        const hunks = parsePatch(pText)
        if (hunks.length === 0) continue
        const hunk = hunks[0]!

        if (hunk.type === 'add') {
          currentLines = hunk.contents.split('\n')
          isAdd = true
          for (let i = 1; i <= currentLines.length; i++) changedLines.add(i)
        } else if (hunk.type === 'delete') {
          isDelete = true
        } else {
          // update — 在当前内容上应用
          const replacements = computeReplacements(currentLines, hunk.path, hunk.chunks)
          currentLines = applyReplacements(currentLines, replacements)

          const sorted = [...replacements].sort((a, b) => a[0] - b[0])
          let offset = 0
          for (const [start, end, newLines] of sorted) {
            const adjustedStart = start + offset
            for (let i = 0; i < newLines.length; i++) {
              changedLines.add(adjustedStart + i + 1)
            }
            offset += newLines.length - (end - start)
          }
        }
      }

      return { content: currentLines.join('\n'), changedLines, isAdd, isDelete }
    } catch {
      return null
    }
  }, [isDone, patches, originalContent])

  // 逻辑：决定 Monaco 显示的内容。
  const displayContent = useMemo(() => {
    if (isDone && patchResult) return patchResult.content
    // 逻辑：Write 工具流式阶段直接显示已接收的 content（即使还没完成）。
    if (combinedPatch.startsWith('*** Write ')) {
      const nl = combinedPatch.indexOf('\n')
      return nl >= 0 ? combinedPatch.slice(nl + 1) : ''
    }
    if (originalContent !== null) return originalContent
    return ''
  }, [isDone, patchResult, originalContent, combinedPatch])

  contentRef.current = displayContent

  // 逻辑：内容或状态变化时更新 Monaco（始终渲染 Editor，不做条件卸载）。
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return

    if (model.getValue() !== displayContent) {
      model.setValue(displayContent)
    }

    if (isDone && patchResult && patchResult.changedLines.size > 0 && !patchResult.isDelete) {
      decorationIdsRef.current = editor.deltaDecorations(
        decorationIdsRef.current,
        computeChangedLineDecorations(monaco, patchResult.changedLines),
      )
    } else {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
    }
  }, [displayContent, isDone, patchResult])

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    applyMonacoTheme(monaco, monacoThemeName)
    // 逻辑：挂载时从 ref 读取最新内容。
    const current = contentRef.current
    if (current) {
      editor.setValue(current)
    }
  }

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    applyMonacoTheme(monaco, monacoThemeName)
  }, [monacoThemeName])

  const editorOptions = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly: true,
      fontSize: 13,
      lineHeight: 22,
      fontFamily: "var(--font-mono, Menlo, Monaco, 'Courier New', monospace)",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      lineNumbersMinChars: 3,
      folding: false,
      wordWrap: 'off',
      smoothScrolling: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    }),
    [],
  )

  if (allToolCallIds.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        无效的工具调用
      </div>
    )
  }

  // 逻辑：状态指示器。
  let statusIndicator: { text: string; color: string; destructive?: boolean } | null = null
  if (isError) {
    statusIndicator = { text: t('saveFailed'), color: 'bg-destructive', destructive: true }
  } else if (isDone && patchResult?.isDelete) {
    statusIndicator = { text: t('file.fileDeleted'), color: 'bg-destructive', destructive: true }
  } else if (isDone && patchResult?.isAdd) {
    statusIndicator = { text: t('file.newFile'), color: 'bg-muted-foreground' }
  } else if (isDone) {
    statusIndicator = { text: t('saved'), color: 'bg-muted-foreground' }
  } else if (loadingOriginal) {
    statusIndicator = { text: t('file.loadingFile'), color: 'bg-foreground animate-pulse' }
  } else if (isStreaming) {
    statusIndicator = { text: t('file.changing'), color: 'bg-foreground animate-pulse' }
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden', isStreaming && 'select-none')}>
      <Editor
        height="100%"
        width="100%"
        defaultValue=""
        language={languageId}
        theme={monacoThemeName}
        onMount={handleEditorMount}
        options={editorOptions}
      />
      {statusIndicator && (
        <div
          className={cn(
            'absolute bottom-3 right-3 flex items-center gap-1.5 rounded-3xl ol-glass-float px-2 py-1 text-xs',
            statusIndicator.destructive ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', statusIndicator.color)} />
          {statusIndicator.text}
        </div>
      )}
    </div>
  )
}
