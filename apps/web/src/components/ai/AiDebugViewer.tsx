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
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { StackHeader } from '@/components/layout/StackHeader'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { requestStackMinimize } from '@/lib/stack-dock-animation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@openloaf/ui/tabs'
import { Copy, FolderOpen } from 'lucide-react'
import { Button } from '@openloaf/ui/button'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import { toast } from 'sonner'

interface AiDebugViewerProps {
  tabId?: string
  panelKey?: string
  /** Chat preface markdown content. */
  prefaceContent?: string
  /** Full prompt content (PROMPT.md). */
  promptContent?: string
  /** Session id for chat history folder. */
  sessionId?: string
  /** Absolute jsonl path. */
  jsonlPath?: string
}

const MONACO_THEME_DARK = 'openloaf-debug-dark'
const MONACO_THEME_LIGHT = 'vs'

const DARK_THEME_COLORS: Monaco.editor.IColors = {
  'editor.background': '#0c1118',
  'editor.foreground': '#e6e6e6',
  'editorLineNumber.foreground': '#6b7280',
  'editorLineNumber.activeForeground': '#e5e7eb',
  'editorGutter.background': '#0c1118',
  'editor.selectionBackground': '#1f3a5f',
  'editor.inactiveSelectionBackground': '#19293f',
  'editorCursor.foreground': '#e6e6e6',
}

function applyDebugTheme(monaco: typeof Monaco, themeName: string) {
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

const EDITOR_OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
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
  folding: true,
  wordWrap: 'on',
  smoothScrolling: true,
  domReadOnly: true,
  readOnlyMessage: { value: '' },
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
}

function ReadOnlyEditor({ value, language }: { value: string; language: string }) {
  const { resolvedTheme } = useTheme()
  const monacoRef = useRef<typeof Monaco | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(
    resolvedTheme === 'dark' ? 'dark' : 'light',
  )
  const monacoThemeName = effectiveTheme === 'dark' ? MONACO_THEME_DARK : MONACO_THEME_LIGHT

  useEffect(() => {
    const root = document.documentElement
    const readDomTheme = () => (root.classList.contains('dark') ? 'dark' : 'light')
    if (resolvedTheme === 'dark' || resolvedTheme === 'light') {
      setEffectiveTheme(resolvedTheme)
    } else {
      setEffectiveTheme(readDomTheme())
    }
    const observer = new MutationObserver(() => setEffectiveTheme(readDomTheme()))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [resolvedTheme])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    applyDebugTheme(monaco, monacoThemeName)
  }, [monacoThemeName])

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      applyDebugTheme(monaco, monacoThemeName)
    },
    [monacoThemeName],
  )

  return (
    <Editor
      height="100%"
      width="100%"
      value={value}
      language={language}
      theme={monacoThemeName}
      onMount={handleMount}
      options={EDITOR_OPTIONS}
    />
  )
}

export default function AiDebugViewer({
  tabId,
  panelKey,
  prefaceContent,
  promptContent,
  sessionId,
  jsonlPath,
}: AiDebugViewerProps) {
  const { t } = useTranslation('ai')
  const removeStackItem = useTabRuntime((s) => s.removeStackItem)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const { workspace } = useWorkspace()
  const shouldRenderStackHeader = Boolean(tabId && panelKey)

  const handleCopyJsonlPath = useCallback(async () => {
    if (!jsonlPath) {
      toast.error(t('debug.copyError'))
      return
    }
    try {
      await navigator.clipboard.writeText(jsonlPath)
      toast.success(t('debug.copySuccess'))
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = jsonlPath
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast.success(t('debug.copySuccess'))
    }
  }, [jsonlPath, t])

  const handleOpenFolder = useCallback(async () => {
    if (!jsonlPath) return
    const api = window.openloafElectron
    if (api?.openPath) {
      const folderPath = jsonlPath.replace(/\/[^/]*$/, '')
      await api.openPath({ uri: `file://${folderPath}` })
    }
  }, [jsonlPath])

  const hasPrompt = Boolean(promptContent?.trim())
  const hasPreface = Boolean(prefaceContent?.trim())

  const defaultTab = hasPrompt ? 'prompt' : 'preface'

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {shouldRenderStackHeader ? (
        <StackHeader
          title={t('debug.title')}
          rightSlotBeforeClose={
            sessionId ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyJsonlPath}
                  aria-label={t('debug.copyLogPath')}
                  title={t('debug.copyLogPath')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenFolder}
                  aria-label={t('debug.openLogFolder')}
                  title={t('debug.openLogFolder')}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </>
            ) : null
          }
          showMinimize
          onMinimize={() => {
            if (!tabId) return
            requestStackMinimize(tabId)
          }}
          onClose={() => {
            if (!tabId || !panelKey) return
            removeStackItem(tabId, panelKey)
          }}
        />
      ) : null}
      <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-2 shrink-0">
          <TabsTrigger value="prompt">{t('debug.systemPrompt')}</TabsTrigger>
          <TabsTrigger value="preface">{t('debug.chatPreface')}</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" className="min-h-0 flex-1">
          {hasPrompt ? (
            <ReadOnlyEditor value={promptContent!} language="markdown" />
          ) : (
            <p className="px-4 py-2 text-sm text-muted-foreground">{t('debug.noSystemPrompt')}</p>
          )}
        </TabsContent>
        <TabsContent value="preface" className="min-h-0 flex-1">
          {hasPreface ? (
            <ReadOnlyEditor value={prefaceContent!} language="markdown" />
          ) : (
            <p className="px-4 py-2 text-sm text-muted-foreground">{t('debug.noPreface')}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
