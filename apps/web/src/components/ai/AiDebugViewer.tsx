'use client'

import { useMemo, useCallback } from 'react'
import { StackHeader } from '@/components/layout/StackHeader'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { requestStackMinimize } from '@/lib/stack-dock-animation'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@tenas-ai/ui/accordion'
import { Streamdown, defaultRemarkPlugins, type StreamdownProps } from 'streamdown'
import { Copy, FolderOpen } from 'lucide-react'
import { Button } from '@tenas-ai/ui/button'
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
function formatToolsMarkdown(tools: Record<string, any>): string {
  const entries = Object.entries(tools)
  if (!entries.length) return '_无工具_'
  const lines: string[] = [`共 ${entries.length} 个工具\n`]
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
  const removeStackItem = useTabRuntime((s) => s.removeStackItem)
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const { workspace } = useWorkspace()
  const shouldRenderStackHeader = Boolean(tabId && panelKey)

  const remarkPlugins = useMemo(() => Object.values(defaultRemarkPlugins), [])

  const toolsMarkdown = useMemo(
    () => (systemTools ? formatToolsMarkdown(systemTools) : ''),
    [systemTools],
  )

  const handleCopyJsonlPath = useCallback(async () => {
    if (!jsonlPath) {
      toast.error('未找到聊天日志文件')
      return
    }
    try {
      await navigator.clipboard.writeText(jsonlPath)
      toast.success('已复制聊天日志路径')
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = jsonlPath
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      toast.success('已复制聊天日志路径')
    }
  }, [jsonlPath])

  const handleOpenFolder = useCallback(async () => {
    if (!jsonlPath) return
    const api = window.tenasElectron
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
          title="AI调试"
          rightSlotBeforeClose={
            sessionId ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyJsonlPath}
                  aria-label="复制日志路径"
                  title="复制日志路径"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenFolder}
                  aria-label="打开日志目录"
                  title="打开日志目录"
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
            <AccordionTrigger>系统提示词</AccordionTrigger>
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
                <p className="text-sm text-muted-foreground">暂无系统提示词（需发送一次消息后生成）</p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tools">
            <AccordionTrigger>工具列表</AccordionTrigger>
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
                <p className="text-sm text-muted-foreground">暂无工具列表（需发送一次消息后生成）</p>
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
                <p className="text-sm text-muted-foreground">暂无 Preface</p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
