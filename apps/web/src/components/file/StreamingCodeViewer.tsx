"use client"

import { useEffect, useMemo, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import Editor, { type OnMount } from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"
import { useChatRuntime } from "@/hooks/use-chat-runtime"
import { getMonacoLanguageId } from "@/components/file/CodeViewer"

/** Monaco theme name for the viewer. */
const MONACO_THEME_DARK = "tenas-dark"
const MONACO_THEME_LIGHT = "vs"

const DARK_THEME_COLORS: Monaco.editor.IColors = {
  "editor.background": "#0c1118",
  "editor.foreground": "#e6e6e6",
  "editorLineNumber.foreground": "#6b7280",
  "editorLineNumber.activeForeground": "#e5e7eb",
  "editorGutter.background": "#0c1118",
  "editor.selectionBackground": "#1f3a5f",
  "editor.inactiveSelectionBackground": "#19293f",
  "editor.selectionHighlightBackground": "#1b2a40",
  "editorCursor.foreground": "#e6e6e6",
}

function applyMonacoTheme(monaco: typeof Monaco, themeName: string) {
  if (themeName === MONACO_THEME_DARK) {
    monaco.editor.defineTheme(MONACO_THEME_DARK, {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: DARK_THEME_COLORS,
    })
  }
  monaco.editor.setTheme(themeName)
}

interface StreamingCodeViewerProps {
  toolCallId?: string
  tabId?: string
}

export default function StreamingCodeViewer({
  toolCallId,
  tabId,
}: StreamingCodeViewerProps) {
  // 逻辑：从 toolPartsByTabId 读取 write-file 工具的实时状态（AI SDK 内部更新）。
  const toolPart = useChatRuntime((s) => {
    if (!tabId || !toolCallId) return undefined
    return s.toolPartsByTabId[tabId]?.[toolCallId]
  })

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const prevContentLenRef = useRef(0)
  // 逻辑：用 ref 存储最新 content，避免 useCallback 闭包捕获旧值。
  const contentRef = useRef("")
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const input = toolPart?.input as
    | { path?: string; content?: string }
    | undefined
  const content = typeof input?.content === "string" ? input.content : ""
  const path = typeof input?.path === "string" ? input.path : ""
  const toolState = typeof toolPart?.state === "string" ? toolPart.state : ""

  // 逻辑：每次 render 同步最新 content 到 ref。
  contentRef.current = content

  // 逻辑：从文件路径提取扩展名，用于 Monaco 语法高亮。
  const ext = useMemo(() => {
    const parts = path.split(".")
    return parts.length > 1 ? (parts.pop() ?? "") : ""
  }, [path])
  const languageId = useMemo(() => getMonacoLanguageId(ext), [ext])

  const { resolvedTheme } = useTheme()
  const monacoThemeName =
    resolvedTheme === "dark" ? MONACO_THEME_DARK : MONACO_THEME_LIGHT

  // 逻辑：增量更新 Monaco 内容，从 ref 读取最新值（不依赖闭包）。
  const applyContentUpdate = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return

    const currentContent = contentRef.current
    const prevLen = prevContentLenRef.current

    if (currentContent.length <= prevLen) return

    const newText = currentContent.slice(prevLen)
    const lastLine = model.getLineCount()
    const lastCol = model.getLineMaxColumn(lastLine)

    // 逻辑：在文档末尾插入新增文本，而非全量替换。
    model.applyEdits([
      {
        range: new (monacoRef.current!.Range)(
          lastLine,
          lastCol,
          lastLine,
          lastCol,
        ),
        text: newText,
      },
    ])
    prevContentLenRef.current = currentContent.length

    // 自动滚动到底部
    const newLastLine = model.getLineCount()
    editor.revealLine(newLastLine)
  }, [])

  // 逻辑：content 变化时用真正的 throttle（非 debounce）更新 Monaco。
  // 如果没有定时器在跑，立即启动一个 80ms 定时器；如果已有定时器，什么都不做（让它到期后刷新）。
  // useEffect 的 cleanup 不清除定时器，避免变成 debounce。
  useEffect(() => {
    if (!editorRef.current) return
    if (throttleTimerRef.current) return // 已有定时器在等待，到期后会读 ref 最新值

    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null
      applyContentUpdate()
    }, 80)
  }, [content, applyContentUpdate])

  // 逻辑：状态变为 input-available/output-available 时，立即刷新确保内容完整。
  useEffect(() => {
    if (
      toolState === "input-available" ||
      toolState === "output-available"
    ) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = null
      }
      applyContentUpdate()
    }
  }, [toolState, applyContentUpdate])

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      applyMonacoTheme(monaco, monacoThemeName)
      // 逻辑：挂载时如果已有内容（降级场景），直接设置。
      const currentContent = contentRef.current
      if (currentContent) {
        editor.setValue(currentContent)
        prevContentLenRef.current = currentContent.length
        const lastLine = editor.getModel()?.getLineCount() ?? 1
        editor.revealLine(lastLine)
      }
    },
    [monacoThemeName],
  )

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    applyMonacoTheme(monaco, monacoThemeName)
  }, [monacoThemeName])

  // 逻辑：组件卸载时清理 throttle 定时器。
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current)
      }
    }
  }, [])

  const editorOptions =
    useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
      () => ({
        readOnly: true,
        fontSize: 13,
        lineHeight: 22,
        fontFamily:
          "var(--font-mono, Menlo, Monaco, 'Courier New', monospace)",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        lineNumbersMinChars: 3,
        folding: false,
        wordWrap: "off",
        smoothScrolling: true,
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
      }),
      [],
    )

  if (!toolCallId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        无效的工具调用
      </div>
    )
  }

  const isStreaming = toolState === "input-streaming"
  const isDone =
    toolState === "output-available" || toolState === "input-available"
  const isError = toolState === "output-error"

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Editor
        height="100%"
        width="100%"
        defaultValue=""
        language={languageId}
        theme={monacoThemeName}
        onMount={handleEditorMount}
        options={editorOptions}
      />
      {/* 状态指示器 */}
      {isStreaming && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
          写入中...
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
          写入失败
        </div>
      )}
    </div>
  )
}
