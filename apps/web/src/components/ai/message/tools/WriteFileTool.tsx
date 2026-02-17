'use client'

import { AlertCircle, Check, ExternalLink, FileCode2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  extractPatchDiffLines,
  extractPatchDiffStats,
  extractPatchFileInfo,
} from '@/lib/chat/patch-utils'
import { useChatSession, useChatTools } from '../../context'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import {
  Commit,
  CommitActions,
  CommitContent,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileIcon,
  CommitFileInfo,
  CommitFilePath,
  CommitFiles,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
} from '@/components/ai-elements/commit'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import type { AnyToolPart } from './shared/tool-utils'

type PatchFileSummary = {
  /** Project-relative file path. */
  path: string
  /** File change type mapped to commit status. */
  status: 'added' | 'modified' | 'deleted'
  /** Added line count in this file. */
  added: number
  /** Removed line count in this file. */
  removed: number
}

/** Parse apply_patch payload into per-file summaries. */
function parsePatchFiles(patch: string): PatchFileSummary[] {
  const files: PatchFileSummary[] = []
  let current: PatchFileSummary | null = null
  let inPatch = false

  for (const line of patch.split('\n')) {
    if (line.startsWith('*** Begin Patch')) {
      inPatch = true
      continue
    }
    if (!inPatch) continue
    if (line.startsWith('*** End Patch')) break

    const addMatch = line.match(/^\*\*\* Add File: (.+)$/)
    if (addMatch) {
      if (current) files.push(current)
      current = { path: addMatch[1] ?? '', status: 'added', added: 0, removed: 0 }
      continue
    }
    const updateMatch = line.match(/^\*\*\* Update File: (.+)$/)
    if (updateMatch) {
      if (current) files.push(current)
      current = { path: updateMatch[1] ?? '', status: 'modified', added: 0, removed: 0 }
      continue
    }
    const deleteMatch = line.match(/^\*\*\* Delete File: (.+)$/)
    if (deleteMatch) {
      if (current) files.push(current)
      current = { path: deleteMatch[1] ?? '', status: 'deleted', added: 0, removed: 0 }
      continue
    }
    if (!current) continue
    if (line.startsWith('***') || line.startsWith('@@')) continue

    if (line.startsWith('+')) current.added += 1
    if (line.startsWith('-')) current.removed += 1
  }

  if (current) files.push(current)
  return files
}

/** Map tool state to short Chinese status text. */
function resolveStateLabel(input: {
  state: string
  isError: boolean
  isStreaming: boolean
  isInputReady: boolean
  isDone: boolean
}): string {
  if (input.isError) return '失败'
  if (input.isStreaming) return '执行中'
  if (input.isInputReady) return '已生成补丁'
  if (input.isDone) return '已完成'
  if (input.state) return input.state
  return '处理中'
}

export default function WriteFileTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId, workspaceId, projectId } = useChatSession()
  const { toolParts } = useChatTools()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)

  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const snapshot = toolCallId ? toolParts[toolCallId] : undefined
  const resolved: AnyToolPart = snapshot
    ? { ...part, ...(snapshot as Partial<AnyToolPart>) }
    : part

  const input = resolved.input as Record<string, unknown> | undefined
  const patch = typeof input?.patch === 'string' ? input.patch : ''
  const { fileName, fileCount, firstPath } = patch
    ? extractPatchFileInfo(patch)
    : { fileName: '写入文件', fileCount: 1, firstPath: '' }
  const patchFiles = patch ? parsePatchFiles(patch) : []
  const state = typeof resolved.state === 'string' ? resolved.state : ''
  const errorText =
    typeof resolved.errorText === 'string' && resolved.errorText.trim()
      ? resolved.errorText
      : ''

  const isStreaming = state === 'input-streaming' || state === 'output-streaming'
  const isDone = state === 'output-available'
  const isInputReady = state === 'input-available'
  const isError = state === 'output-error'

  const diffStats = patch ? extractPatchDiffStats(patch) : null
  const diffLines = patch ? extractPatchDiffLines(patch, 10) : []
  const showStats = isDone && !isError && diffStats
  const statusLabel = resolveStateLabel({
    state,
    isError,
    isStreaming,
    isInputReady,
    isDone,
  })
  const openDisabled = !tabId || !toolCallId

  const handleClick = () => {
    if (!tabId || !toolCallId) return

    // 逻辑：查找已有包含此 toolCallId 的 stack item。
    const runtime = useTabRuntime.getState().runtimeByTabId[tabId]
    const existingItem = runtime?.stack?.find((s: any) => {
      const ids = (s.params?.toolCallIds as string[]) ?? []
      return ids.includes(toolCallId)
    })

    if (existingItem) {
      // 逻辑：已有 stack → 激活它（pushStackItem 会 upsert 并激活）。
      pushStackItem(tabId, existingItem)
      return
    }

    // 逻辑：无已有 stack → 收集同文件的所有 toolCallIds 并新建。
    const toolCallIds = [toolCallId]
    if (firstPath) {
      const allParts = useChatRuntime.getState().toolPartsByTabId[tabId] ?? {}
      for (const [key, tp] of Object.entries(allParts)) {
        if (key === toolCallId) continue
        const tpInput = (tp as any)?.input as Record<string, unknown> | undefined
        const tpPatch = typeof tpInput?.patch === 'string' ? tpInput.patch : ''
        if (!tpPatch) continue
        const { firstPath: tpPath } = extractPatchFileInfo(tpPatch)
        if (tpPath === firstPath) toolCallIds.push(key)
      }
    }

    const stackId = `streaming-write:${toolCallId}`
    pushStackItem(tabId, {
      id: stackId,
      sourceKey: stackId,
      component: 'streaming-code-viewer',
      title: fileName,
      params: {
        toolCallIds,
        tabId,
        workspaceId: workspaceId ?? '',
        projectId,
        __isStreaming: isStreaming,
      },
    })
  }

  const fallbackFile = firstPath
    ? [
        {
          path: firstPath,
          status:
            diffStats?.type === 'add'
              ? ('added' as const)
              : diffStats?.type === 'delete'
                ? ('deleted' as const)
                : ('modified' as const),
          added: diffStats?.added ?? 0,
          removed: diffStats?.removed ?? 0,
        },
      ]
    : []
  const files = patchFiles.length > 0 ? patchFiles : fallbackFile

  const previewText = diffLines
    .map((line) => {
      const numberPrefix = line.lineNo == null ? '' : `${String(line.lineNo).padStart(4, ' ')} `
      return `${line.type}${numberPrefix}${line.text}`
    })
    .join('\n')

  return (
    <div className={cn('ml-2 w-full min-w-0 max-w-[90%]', className)}>
      <Commit defaultOpen={isStreaming || isInputReady}>
        <CommitHeader>
          <CommitInfo>
            <CommitMessage className="flex items-center gap-2">
              {isError ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : isDone ? (
                <Check className="size-4 text-green-500" />
              ) : (
                <FileCode2 className="size-4 text-muted-foreground" />
              )}
              <span className="truncate">
                {fileName}
                {fileCount > 1 ? ` +${fileCount - 1}` : ''}
              </span>
            </CommitMessage>
            <CommitMetadata>
              <span>{statusLabel}</span>
              {showStats ? <span>•</span> : null}
              {showStats && diffStats.type === 'delete' ? <span>已删除</span> : null}
              {showStats && diffStats.type !== 'delete' ? (
                <span>
                  +{diffStats.added} / -{diffStats.removed}
                </span>
              ) : null}
            </CommitMetadata>
          </CommitInfo>
          <CommitActions>
            <PromptInputButton
              size="sm"
              variant="ghost"
              type="button"
              onClick={handleClick}
              disabled={openDisabled}
            >
              查看
              <ExternalLink className="ml-1 size-3.5" />
            </PromptInputButton>
          </CommitActions>
        </CommitHeader>
        <CommitContent>
          {isError ? (
            <div className="text-sm text-destructive">{errorText || '写入失败'}</div>
          ) : (
            <div className="space-y-3">
              {files.length > 0 ? (
                <CommitFiles>
                  {files.map((file) => (
                    <CommitFile key={`${file.status}:${file.path}`}>
                      <CommitFileInfo>
                        <CommitFileIcon />
                        <CommitFilePath>{file.path}</CommitFilePath>
                      </CommitFileInfo>
                      <CommitFileChanges>
                        <CommitFileAdditions count={file.added} />
                        <CommitFileDeletions count={file.removed} />
                      </CommitFileChanges>
                    </CommitFile>
                  ))}
                </CommitFiles>
              ) : null}

              {previewText ? (
                <CodeBlock
                  code={previewText}
                  language={'diff' as any}
                  className="w-full"
                >
                  <CodeBlockHeader>
                    <CodeBlockTitle>补丁预览</CodeBlockTitle>
                    <CodeBlockActions>
                      <CodeBlockCopyButton />
                    </CodeBlockActions>
                  </CodeBlockHeader>
                </CodeBlock>
              ) : null}
            </div>
          )}
        </CommitContent>
      </Commit>
    </div>
  )
}
