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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TabActiveProvider } from '@/components/layout/TabActiveContext'
import {
  ChatActionsProvider,
  ChatOptionsProvider,
  ChatSessionProvider,
  ChatStateProvider,
  ChatToolProvider,
} from '@/components/ai/context'
import type { ToolPartSnapshot } from '@/hooks/use-chat-runtime'
import MessageTool from '@/components/ai/message/tools/MessageTool'
import type { AnyToolPart } from '@/components/ai/message/tools/shared/tool-utils'
import { TOOL_FIXTURE_GROUPS, type ToolFixture } from './fixtures'

const NOOP = () => {}
const NOOP_ASYNC = async () => false

function stateValueFor(status: 'ready' | 'streaming' = 'ready') {
  return {
    messages: [],
    status,
    error: undefined as Error | undefined,
    isHistoryLoading: false,
    stepThinking: false,
    pendingCloudMessage: null,
  }
}

const sessionValue = {
  sessionId: 'tool-gallery-session',
  tabId: 'tool-gallery-tab',
  projectId: undefined,
  leafMessageId: null,
  branchMessageIds: [] as string[],
  siblingNav: {} as Record<string, any>,
}

const actionsValue = {
  sendMessage: NOOP as any,
  regenerate: NOOP as any,
  addToolApprovalResponse: NOOP as any,
  clearError: NOOP as any,
  stopGenerating: NOOP,
  updateMessage: NOOP as any,
  newSession: NOOP,
  selectSession: NOOP as any,
  switchSibling: NOOP as any,
  retryAssistantMessage: NOOP as any,
  continueAssistantTurn: NOOP as any,
  resendUserMessage: NOOP as any,
  deleteMessageSubtree: NOOP_ASYNC as any,
  setPendingCloudMessage: NOOP as any,
  sendPendingCloudMessage: NOOP,
  readOnly: true,
}

const optionsValue = {
  input: '',
  setInput: NOOP as any,
  imageOptions: undefined,
  setImageOptions: NOOP as any,
  codexOptions: undefined,
  setCodexOptions: NOOP as any,
  claudeCodeOptions: undefined,
  setClaudeCodeOptions: NOOP as any,
}

function buildToolParts(fixtures: ToolFixture[]): Record<string, ToolPartSnapshot> {
  const map: Record<string, ToolPartSnapshot> = {}
  for (const fx of fixtures) {
    const id = fx.part.toolCallId
    if (!id) continue
    map[id] = {
      type: fx.part.type,
      toolCallId: id,
      toolName: fx.part.toolName,
      state: fx.part.state,
      input: fx.part.input,
      output: fx.part.output,
      errorText: fx.part.errorText ?? undefined,
      approval: fx.part.approval,
      providerExecuted: fx.part.providerExecuted,
      mediaGenerate: fx.part.mediaGenerate,
      toolProgress: fx.part.toolProgress,
    } as ToolPartSnapshot
  }
  return map
}

type RenderItem = {
  fixture: ToolFixture
  part: AnyToolPart
}

/** Copyable tool-kind chip. Clicking copies the name to clipboard. */
function CopyableKind({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const handleCopy = React.useCallback(() => {
    try {
      void navigator.clipboard.writeText(value)
    } catch {
      /* noop */
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1200)
  }, [value])
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? '已复制' : `点击复制: ${value}`}
      className="cursor-pointer select-text rounded font-mono text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      {value}
      {copied ? <span className="ml-1 text-[10px] text-emerald-500">已复制</span> : null}
    </button>
  )
}

/** Single tool card. */
function ToolCard({ item }: { item: RenderItem }) {
  const { fixture, part } = item
  const stateLabel = part.state ?? 'n/a'
  return (
    <section data-testid={`tool-fixture-${fixture.id}`} className="space-y-1.5">
      <header className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <CopyableKind value={fixture.toolKind} />
        <span>·</span>
        <span>{fixture.title}</span>
        <span className="ml-auto font-mono text-[10px] opacity-60">
          {stateLabel}
        </span>
        {fixture.providerExecuted ? (
          <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
            providerExecuted
          </span>
        ) : null}
      </header>
      <MessageTool part={part} messageId="gallery-msg" />
    </section>
  )
}

export type ToolGalleryHarnessProps = {
  /** When set, only render groups whose key is in this list. */
  onlyGroups?: string[]
}

export default function ToolGalleryHarness({ onlyGroups }: ToolGalleryHarnessProps) {
  const queryClient = React.useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
        },
      }),
    [],
  )

  const groups = React.useMemo(() => {
    if (!onlyGroups?.length) return TOOL_FIXTURE_GROUPS
    const set = new Set(onlyGroups)
    return TOOL_FIXTURE_GROUPS.filter((g) => set.has(g.key))
  }, [onlyGroups])

  const allFixtures = React.useMemo(
    () => groups.flatMap((g) => g.fixtures),
    [groups],
  )
  const toolParts = React.useMemo(() => buildToolParts(allFixtures), [allFixtures])

  // 有些 fixture 是 streaming 态，让 ChatStatus 同时提供 "streaming"，
  // 但状态是全局的，所以采用单个 ready 状态 + fixture 自身 state，MessageTool
  // 会按 fixture 的 state 自行处理（唯一影响是 ShellTool 会在 ready+streaming 时
  // 强制把 state 切成 available，这里让状态跟随 fixture —— 传 streaming 即可）。
  const stateValue = React.useMemo(() => stateValueFor('streaming'), [])

  const toolsValue = React.useMemo(
    () => ({
      toolParts,
      upsertToolPart: NOOP as any,
      markToolStreaming: NOOP as any,
      queueToolApprovalPayload: NOOP as any,
      clearToolApprovalPayload: NOOP as any,
      continueAfterToolApprovals: NOOP as any,
    }),
    [toolParts],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TabActiveProvider active={true}>
        <ChatStateProvider value={stateValue}>
          <ChatSessionProvider value={sessionValue}>
            <ChatActionsProvider value={actionsValue}>
              <ChatOptionsProvider value={optionsValue}>
                <ChatToolProvider value={toolsValue}>
                  <div data-testid="tool-gallery-root" className="flex flex-col gap-10">
                    {groups.map((group) => (
                      <div key={group.key} data-testid={`tool-group-${group.key}`}>
                        <div className="mb-3 border-b border-border/60 pb-2">
                          <h2 className="text-lg font-semibold">{group.label}</h2>
                          {group.description ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                          {group.fixtures.map((fixture) => (
                            <ToolCard
                              key={fixture.id}
                              item={{ fixture, part: fixture.part }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ChatToolProvider>
              </ChatOptionsProvider>
            </ChatActionsProvider>
          </ChatSessionProvider>
        </ChatStateProvider>
      </TabActiveProvider>
    </QueryClientProvider>
  )
}
