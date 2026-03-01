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

import { useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StackHeader } from '@/components/layout/StackHeader'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { requestStackMinimize } from '@/lib/stack-dock-animation'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@openloaf/ui/accordion'
import { Streamdown, defaultRemarkPlugins, type StreamdownProps } from 'streamdown'
import { Copy, FolderOpen } from 'lucide-react'
import { Button } from '@openloaf/ui/button'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import { toast } from 'sonner'

import '@/components/file/style/streamdown-viewer.css'

interface AiDebugViewerProps {
  tabId?: string
  panelKey?: string
  /** Chat preface markdown content. */
  prefaceContent?: string
  /** System instructions from system.json. */
  systemInstructions?: string
  /** Serialized tools from system.json. */
  systemTools?: Record<string, any>
  /** Session id for chat history folder. */
  sessionId?: string
  /** Absolute jsonl path. */
  jsonlPath?: string
}

const SHIKI_THEME: NonNullable<StreamdownProps['shikiTheme']> = ['github-light', 'github-dark-high-contrast']

/** Format tools object into readable markdown. */
function formatToolsMarkdown(tools: Record<string, any>, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const entries = Object.entries(tools)
  if (!entries.length) return t('debug.noTools')
  const lines: string[] = [`${t('debug.toolCount', { count: entries.length })}\n`]
  for (const [name, def] of entries) {
    lines.push(`### ${name}`)
    if (def?.description) lines.push(`${def.description}\n`)
    if (def?.parameters) {
      lines.push('```json')
      lines.push(JSON.stringify(def.parameters, null, 2))
      lines.push('```\n')
    }
  }
  return lines.join('\n')
}

export default function AiDebugViewer({
  tabId,
  panelKey,
  prefaceContent,
  systemInstructions,
  systemTools,
  sessionId,
  jsonlPath,
}: AiDebugViewerProps) {
  const { t } = useTranslation('ai')
  const removeStackItem = useTabRuntime((s) => s.removeStackItem)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const { workspace } = useWorkspace()
  const shouldRenderStackHeader = Boolean(tabId && panelKey)

  const remarkPlugins = useMemo(() => Object.values(defaultRemarkPlugins), [])

  const toolsMarkdown = useMemo(
    () => (systemTools ? formatToolsMarkdown(systemTools, t) : ''),
    [systemTools, t],
  )

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

  const hasInstructions = Boolean(systemInstructions?.trim())
  const hasTools = Boolean(systemTools && Object.keys(systemTools).length)
  const hasPreface = Boolean(prefaceContent?.trim())

  // 逻辑：默认展开有内容的面板。
  const defaultOpen = useMemo(() => {
    const items: string[] = []
    if (hasInstructions) items.push('instructions')
    if (hasTools) items.push('tools')
    if (hasPreface) items.push('preface')
    return items
  }, [hasInstructions, hasTools, hasPreface])

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
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
        <Accordion type="multiple" defaultValue={defaultOpen}>
          <AccordionItem value="instructions">
            <AccordionTrigger>{t('debug.systemPrompt')}</AccordionTrigger>
            <AccordionContent>
              {hasInstructions ? (
                <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3">
                  <Streamdown
                    mode="static"
                    className="streamdown-viewer space-y-3"
                    remarkPlugins={remarkPlugins}
                    shikiTheme={SHIKI_THEME}
                  >
                    {systemInstructions!}
                  </Streamdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('debug.noSystemPrompt')}</p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tools">
            <AccordionTrigger>{t('debug.toolList')}</AccordionTrigger>
            <AccordionContent>
              {hasTools ? (
                <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3">
                  <Streamdown
                    mode="static"
                    className="streamdown-viewer space-y-3"
                    remarkPlugins={remarkPlugins}
                    shikiTheme={SHIKI_THEME}
                  >
                    {toolsMarkdown}
                  </Streamdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('debug.noToolList')}</p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="preface">
            <AccordionTrigger>Chat Preface</AccordionTrigger>
            <AccordionContent>
              {hasPreface ? (
                <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3">
                  <Streamdown
                    mode="static"
                    className="streamdown-viewer space-y-3"
                    remarkPlugins={remarkPlugins}
                    shikiTheme={SHIKI_THEME}
                  >
                    {prefaceContent!}
                  </Streamdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('debug.noPreface')}</p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
