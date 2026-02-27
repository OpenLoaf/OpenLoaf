/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RequestUserInputTool from '../RequestUserInputTool'
import { ChatStateProvider } from '@/components/ai/context/ChatStateContext'
import { ChatActionsProvider } from '@/components/ai/context/ChatActionsContext'
import { ChatToolProvider } from '@/components/ai/context/ChatToolContext'
import { ChatSessionProvider } from '@/components/ai/context/ChatSessionContext'

vi.mock('@/utils/trpc', () => {
  const mutationOptions = (mutationFn: any) => ({ mutationFn })
  return {
    trpc: {
      chat: {
        updateMessageParts: {
          mutationOptions: () => mutationOptions(vi.fn().mockResolvedValue(true)),
        },
      },
      ai: {
        storeSecret: {
          mutationOptions: () => mutationOptions(vi.fn().mockResolvedValue({ token: 'tok' })),
        },
      },
    },
  }
})

function renderWithProviders(ui: React.ReactNode, providers: {
  messages?: any[]
  status?: any
  addToolApprovalResponse?: any
  updateMessage?: any
  queueToolApprovalPayload?: any
  continueAfterToolApprovals?: any
  toolParts?: Record<string, any>
} = {}) {
  const queryClient = new QueryClient()
  const messages = providers.messages ?? []
  const status = providers.status ?? 'ready'
  const addToolApprovalResponse = providers.addToolApprovalResponse ?? vi.fn().mockResolvedValue(undefined)
  const updateMessage = providers.updateMessage ?? vi.fn()
  const queueToolApprovalPayload = providers.queueToolApprovalPayload ?? vi.fn()
  const continueAfterToolApprovals = providers.continueAfterToolApprovals ?? vi.fn().mockResolvedValue(undefined)
  const toolParts = providers.toolParts ?? {}

  return render(
    <QueryClientProvider client={queryClient}>
      <ChatSessionProvider value={{
        sessionId: 'sess-1',
        tabId: 'tab-1',
        leafMessageId: null,
        branchMessageIds: [],
        siblingNav: {},
      }}>
        <ChatStateProvider value={{
          messages,
          status,
          error: undefined,
          isHistoryLoading: false,
          stepThinking: false,
        }}>
          <ChatActionsProvider value={{
            sendMessage: vi.fn() as any,
            regenerate: vi.fn() as any,
            addToolApprovalResponse,
            clearError: vi.fn() as any,
            stopGenerating: vi.fn(),
            updateMessage,
            newSession: vi.fn(),
            selectSession: vi.fn() as any,
            switchSibling: vi.fn() as any,
            retryAssistantMessage: vi.fn(),
            resendUserMessage: vi.fn() as any,
            deleteMessageSubtree: vi.fn() as any,
            setPendingCloudMessage: vi.fn(),
            sendPendingCloudMessage: vi.fn(),
          }}>
            <ChatToolProvider value={{
              toolParts,
              upsertToolPart: vi.fn(),
              markToolStreaming: vi.fn(),
              subAgentStreams: {},
              queueToolApprovalPayload,
              clearToolApprovalPayload: vi.fn(),
              continueAfterToolApprovals,
            }}>
              {ui}
            </ChatToolProvider>
          </ChatActionsProvider>
        </ChatStateProvider>
      </ChatSessionProvider>
    </QueryClientProvider>
  )
}

describe('RequestUserInputTool approval flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits answers and triggers continuation', async () => {
    const part = {
      type: 'tool-request-user-input',
      toolName: 'request-user-input',
      toolCallId: 'call-1',
      state: 'approval-requested',
      approval: { id: 'approval-1' },
      input: {
        actionName: '收集信息',
        mode: 'form',
        questions: [
          { key: 'api_key', label: 'API Key', type: 'text', required: true },
        ],
      },
    }

    const continueAfterToolApprovals = vi.fn().mockResolvedValue(undefined)
    const queueToolApprovalPayload = vi.fn()
    const addToolApprovalResponse = vi.fn().mockResolvedValue(undefined)
    const updateMessage = vi.fn()

    renderWithProviders(
      <RequestUserInputTool part={part as any} />,
      {
        messages: [{ id: 'assistant-1', role: 'assistant', parts: [part] }],
        addToolApprovalResponse,
        queueToolApprovalPayload,
        continueAfterToolApprovals,
        updateMessage,
        toolParts: { 'call-1': part },
      },
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'sk-123' } })

    const submit = screen.getByRole('button', { name: '确定' })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(addToolApprovalResponse).toHaveBeenCalledWith({ id: 'approval-1', approved: true })
    })

    const outputUpdate = updateMessage.mock.calls.find(([, updates]) => {
      const parts = (updates as any)?.parts ?? []
      return parts.some((p: any) => p?.output?.answers?.api_key === 'sk-123')
    })
    expect(outputUpdate).toBeTruthy()
    expect(queueToolApprovalPayload).toHaveBeenCalledWith('call-1', {
      answers: { api_key: 'sk-123' },
    })
    expect(continueAfterToolApprovals).toHaveBeenCalled()
  })

  it('does not continue when validation fails', async () => {
    const part = {
      type: 'tool-request-user-input',
      toolName: 'request-user-input',
      toolCallId: 'call-2',
      state: 'approval-requested',
      approval: { id: 'approval-2' },
      input: {
        actionName: '收集信息',
        mode: 'form',
        questions: [
          { key: 'api_key', label: 'API Key', type: 'text', required: true },
        ],
      },
    }

    const continueAfterToolApprovals = vi.fn().mockResolvedValue(undefined)

    renderWithProviders(
      <RequestUserInputTool part={part as any} />,
      {
        messages: [{ id: 'assistant-2', role: 'assistant', parts: [part] }],
        continueAfterToolApprovals,
        toolParts: { 'call-2': part },
      },
    )

    const submit = screen.getByRole('button', { name: '确定' })
    fireEvent.click(submit)

    await waitFor(() => {
      expect(continueAfterToolApprovals).not.toHaveBeenCalled()
    })
  })
})
