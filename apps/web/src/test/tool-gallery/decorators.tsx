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
import type { AnyToolPart } from '@/components/ai/message/tools/shared/tool-utils'

const NOOP = () => {}
const NOOP_ASYNC = async () => false

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

const stateValue = {
  messages: [],
  status: 'streaming' as const,
  error: undefined as Error | undefined,
  isHistoryLoading: false,
  stepThinking: false,
  pendingCloudMessage: null,
}

function partToSnapshot(part: AnyToolPart): ToolPartSnapshot {
  return {
    type: part.type,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    state: part.state,
    input: part.input,
    output: part.output,
    errorText: part.errorText ?? undefined,
    approval: part.approval,
    providerExecuted: part.providerExecuted,
    mediaGenerate: part.mediaGenerate,
    toolProgress: part.toolProgress,
  } as ToolPartSnapshot
}

export function ChatProvidersDecorator({ parts, children }: { parts: AnyToolPart[]; children: React.ReactNode }) {
  const queryClient = React.useMemo(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false } } }),
    [],
  )
  const toolParts = React.useMemo(() => {
    const map: Record<string, ToolPartSnapshot> = {}
    for (const p of parts) {
      if (p.toolCallId) map[p.toolCallId] = partToSnapshot(p)
    }
    return map
  }, [parts])
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
                <ChatToolProvider value={toolsValue}>{children}</ChatToolProvider>
              </ChatOptionsProvider>
            </ChatActionsProvider>
          </ChatSessionProvider>
        </ChatStateProvider>
      </TabActiveProvider>
    </QueryClientProvider>
  )
}
