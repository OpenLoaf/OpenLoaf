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

import * as React from 'react'
import { ChevronRightIcon, FileIcon, FolderOpenIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
import { useLayoutState } from '@/hooks/use-layout-state'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import {
  asPlainObject,
  getDisplayPath,
  isToolStreaming,
  normalizeToolInput,
} from './shared/tool-utils'
import type { AnyToolPart, ToolVariant } from './shared/tool-utils'

// ── Tree node type ──

type TreeNode = {
  name: string
  children: Map<string, TreeNode>
  files: string[]
}

/** Parse tab-indented tree output into a tree structure. */
function parseTreeOutput(output: string): TreeNode {
  const root: TreeNode = { name: '', children: new Map(), files: [] }
  if (!output) return root

  const lines = output.split('\n')
  const stack: [number, TreeNode][] = [[-1, root]]

  for (const line of lines) {
    if (!line.trim()) continue

    let depth = 0
    while (depth < line.length && line[depth] === '\t') depth++

    const content = line.slice(depth).trimEnd()
    if (!content) continue

    const isDir = content.endsWith('/')

    while (stack.length > 1 && stack[stack.length - 1]![0] >= depth) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]![1]

    if (isDir) {
      const dirName = content.slice(0, -1)
      let child = parent.children.get(dirName)
      if (!child) {
        child = { name: dirName, children: new Map(), files: [] }
        parent.children.set(dirName, child)
      }
      stack.push([depth, child])
    } else {
      parent.files.push(content)
    }
  }

  return root
}

/** Count total files recursively. */
function countFiles(node: TreeNode): number {
  let count = node.files.length
  for (const child of node.children.values()) {
    count += countFiles(child)
  }
  return count
}

/** Collect directory path segments from root to this node. */
function buildDirPath(segments: string[]): string {
  return segments.join('/')
}

// ── Context for file click handler ──

const FileClickContext = React.createContext<((relativePath: string) => void) | null>(null)

// ── Render components ──

function TreeDir({
  node,
  depth,
  pathSegments,
}: {
  node: TreeNode
  depth: number
  pathSegments: string[]
}) {
  const [open, setOpen] = React.useState(true)
  const totalFiles = React.useMemo(() => countFiles(node), [node])
  const currentSegments = React.useMemo(
    () => [...pathSegments, node.name],
    [pathSegments, node.name],
  )

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group/dir flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <ChevronRightIcon
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <FolderOpenIcon className="size-3 shrink-0 text-amber-500/80" />
        <span className="flex-1 truncate font-mono text-xs text-foreground">
          {node.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/50">
          {totalFiles}
        </span>
      </button>
      {open ? (
        <div>
          {[...node.children.values()].map((child) => (
            <TreeDir key={child.name} node={child} depth={depth + 1} pathSegments={currentSegments} />
          ))}
          {node.files.map((file) => (
            <TreeFile key={file} name={file} depth={depth + 1} dirPath={buildDirPath(currentSegments)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TreeFile({ name, depth, dirPath }: { name: string; depth: number; dirPath: string }) {
  const onFileClick = React.useContext(FileClickContext)
  const relativePath = dirPath ? `${dirPath}/${name}` : name

  return (
    <button
      type="button"
      onClick={() => onFileClick?.(relativePath)}
      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60"
      style={{ paddingLeft: `${depth * 12 + 4 + 16}px` }}
    >
      <FileIcon className="size-3 shrink-0 text-muted-foreground/60" />
      <span className="truncate font-mono text-xs text-foreground/80">{name}</span>
    </button>
  )
}

function FileTreeView({ output }: { output: string }) {
  const tree = React.useMemo(() => parseTreeOutput(output), [output])

  const truncationMatch = output.match(/\.\.\. \((\d+) more files.*\)/)
  const totalFiles = countFiles(tree)

  if (tree.children.size === 0 && tree.files.length === 0) {
    return (
      <div className="rounded-2xl bg-muted/50 p-2 font-mono text-xs text-foreground/80">
        {output}
      </div>
    )
  }

  const emptySegments: string[] = []

  return (
    <div className="space-y-1">
      <div className="max-h-[320px] overflow-y-auto rounded-2xl bg-muted/50 p-1.5">
        {[...tree.children.values()].map((child) => (
          <TreeDir key={child.name} node={child} depth={0} pathSegments={emptySegments} />
        ))}
        {tree.files.map((file) => (
          <TreeFile key={file} name={file} depth={0} dirPath="" />
        ))}
      </div>
      <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground/60">
        <span>{totalFiles} 个文件</span>
        {truncationMatch ? (
          <span>(还有 {truncationMatch[1]} 个未显示)</span>
        ) : null}
      </div>
    </div>
  )
}

// ── Main component ──

export default function GlobTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const { projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const pattern = typeof inputObj?.pattern === 'string' ? inputObj.pattern : ''
  const searchPath = typeof inputObj?.path === 'string' ? inputObj.path : ''

  const displaySearchPath = getDisplayPath(searchPath, projectRootUri)
  const inlineText = [pattern, displaySearchPath].filter(Boolean).join(' in ')
  const tooltipText = [
    pattern && `pattern: ${pattern}`,
    displaySearchPath && `path: ${displaySearchPath}`,
  ].filter(Boolean).join('\n')

  // Track the last opened stack item so we can replace it on next click
  const prevStackIdRef = React.useRef<string | null>(null)

  const handleFileClick = React.useCallback(
    (relativePath: string) => {
      const fullPath = searchPath
        ? `${searchPath.replace(/\/$/, '')}/${relativePath}`
        : relativePath
      const fileName = relativePath.split('/').pop() ?? relativePath
      const entry = createFileEntryFromUri({ uri: fullPath, name: fileName })
      if (!entry) return

      // Close the previously opened stack item from this glob tool
      if (prevStackIdRef.current) {
        useLayoutState.getState().removeStackItem(prevStackIdRef.current)
      }

      openFile({ entry, tabId, projectId: projectId ?? undefined, rootUri: projectRootUri })
      // Store the entry uri as the stack item id (matches buildStackItemForEntry logic)
      prevStackIdRef.current = entry.uri
    },
    [searchPath, tabId, projectId, projectRootUri],
  )

  const output = typeof part.output === 'string' ? part.output : ''
  const hasOutput = output.trim().length > 0
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined

  return (
    <FileClickContext value={handleFileClick}>
      <Collapsible className={cn('min-w-0 text-xs', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
                'transition-colors duration-150 hover:bg-muted/60',
              )}
            >
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Glob</span>
              {inlineText ? (
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                  {inlineText}
                </span>
              ) : null}
              {streaming ? (
                <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
              ) : hasError ? (
                <XCircleIcon className="size-3 shrink-0 text-destructive" />
              ) : null}
            </CollapsibleTrigger>
          </TooltipTrigger>
          {tooltipText ? (
            <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap font-mono text-xs">
              {tooltipText}
            </TooltipContent>
          ) : null}
        </Tooltip>
        <CollapsibleContent className="space-y-2 px-2.5 py-2 text-xs">
          {hasOutput ? (
            <FileTreeView output={output} />
          ) : errorText ? (
            <div className="rounded-2xl bg-destructive/10 p-2 text-xs text-destructive">
              {errorText}
            </div>
          ) : streaming ? (
            <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
              <LoaderCircleIcon className="size-3 animate-spin" />
              <span>搜索中...</span>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </FileClickContext>
  )
}
