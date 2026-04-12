/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Tool showcase rendering test.
 * Verifies that every tool component renders without error.
 */

import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MessageTool from '../tools/MessageTool'
import { ChatSessionProvider } from '@/components/ai/context/ChatSessionContext'
import { ChatStateProvider } from '@/components/ai/context/ChatStateContext'
import { ChatActionsProvider } from '@/components/ai/context/ChatActionsContext'
import { ChatToolProvider } from '@/components/ai/context/ChatToolContext'
import { TOOL_SHOWCASE_GROUPS } from './fixtures/toolShowcaseFixture'

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock('@/utils/trpc', () => {
  const { QueryClient } = require('@tanstack/react-query')
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'queryOptions') return (..._a: any[]) => ({ queryKey: ['mock'], queryFn: async () => null })
      if (prop === 'mutationOptions') return (..._a: any[]) => ({ mutationFn: () => Promise.resolve(true) })
      return new Proxy({}, handler)
    },
  }
  return {
    trpc: new Proxy({}, handler),
    queryClient: new QueryClient(),
  }
})

vi.mock('@/hooks/use-project', () => ({
  useProject: () => ({ data: { project: { rootUri: '/mock/project-space' } } }),
}))

vi.mock('@/hooks/use-app-view', () => {
  const state = {
    chatSessionId: 'session-1',
    chatParams: {},
    projectShell: null,
    title: 'Test',
    icon: '',
    navigate: vi.fn(),
    setChatSession: vi.fn(),
    setChatParams: vi.fn(),
  }
  const useAppView = (selector?: any) => (typeof selector === 'function' ? selector(state) : state)
  useAppView.getState = () => state
  useAppView.subscribe = vi.fn(() => vi.fn())
  return { useAppView }
})

vi.mock('@/hooks/use-layout-state', () => {
  const state = { base: undefined, stack: [], pushStackItem: vi.fn(), removeStackItem: vi.fn() }
  const useLayoutState = (selector?: any) => (typeof selector === 'function' ? selector(state) : state)
  useLayoutState.getState = () => state
  return { useLayoutState }
})

vi.mock('@/hooks/use-chat-runtime', () => ({
  useChatRuntime: () => ({
    subAgentStreamsByTabId: {},
  }),
}))

vi.mock('@/lib/image/uri', () => ({
  fetchBlobFromUri: vi.fn().mockResolvedValue(null),
  resolveFileUri: vi.fn((p: string) => p),
  createBlobUrl: vi.fn(() => ''),
  getPreviewEndpoint: vi.fn((path: string) => path),
}))

vi.mock('@/components/file/lib/open-file', () => ({
  createFileEntryFromUri: vi.fn(),
  openFile: vi.fn(),
  openFilePreview: vi.fn(),
}))

vi.mock('@/components/desktop/DesktopWidgetLibraryPanel', () => ({
  useWidgetLibraryPanel: () => ({
    openPanel: vi.fn(),
  }),
  DesktopWidgetLibraryPanel: () => null,
  WIDGET_LIBRARY_PANEL_ID: 'widget-library',
}))

vi.mock('@/lib/chat/jsx-create-events', () => ({
  emitJsxCreateRefresh: vi.fn(),
  onJsxCreateRefresh: vi.fn(() => () => {}),
}))

vi.mock('@/lib/chat/patch-utils', () => ({
  parsePatchSummary: vi.fn(() => []),
  extractPatchFileInfo: vi.fn(() => ({ filePath: '', status: 'modified' })),
  extractPatchDiffStats: vi.fn(() => ({ added: 0, removed: 0 })),
  extractPatchDiffLines: vi.fn(() => []),
  detectLanguageFromPath: vi.fn(() => 'text'),
}))

vi.mock('@/components/ai-elements/jsx-preview', () => ({
  JsxPreviewFrame: () => null,
  JsxPreviewSkeleton: () => null,
  JsxPreviewErrorBanner: () => null,
  JSXPreview: () => null,
  JSXPreviewContent: () => null,
  JSXPreviewError: () => null,
  useJSXPreview: () => ({ error: null, isLoading: false }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: any) => opts?.defaultValue ?? k,
    i18n: { language: 'zh-CN' },
  }),
}))

vi.mock('i18next', () => ({
  default: {
    t: (k: string, opts?: any) => opts?.defaultValue ?? k,
    language: 'zh-CN',
  },
}))

vi.mock('@/lib/image/drag', () => ({
  setImageDragPayload: vi.fn(),
}))

vi.mock('@/utils/is-electron-env', () => ({
  isElectronEnv: () => false,
}))

vi.mock('@/components/browser/browser-utils', () => ({
  normalizeUrl: (url: string) => url,
}))

vi.mock('@/hooks/tab-id', () => ({
  createBrowserTabId: () => 'browser-tab-1',
}))

// Stub all ai-elements modules used by tool components.
// vi.mock is hoisted, so helpers must be defined inline.

vi.mock('@/components/ai-elements/sources', () => {
  const P = ({ children }: any) => children ?? null
  const N = () => null
  return {
    Sources: P, SourcesContent: P, SourcesTrigger: P, Source: P,
    SourceBadge: N, SourceBadgeGroup: N, SourceListDialog: N,
    useSourceItems: () => [], resolveSourceTitle: (s: string) => s,
  }
})

vi.mock('@/components/ai-elements/tool', () => {
  const P = ({ children }: any) => children ?? null
  const N = () => null
  return { Tool: P, ToolContent: P, ToolHeader: N, ToolInput: N, ToolOutput: N }
})

vi.mock('@/components/ai-elements/confirmation', () => {
  const P = ({ children }: any) => children ?? null
  return {
    Confirmation: P, ConfirmationAccepted: P, ConfirmationActions: P,
    ConfirmationRejected: P, ConfirmationRequest: P, ConfirmationTitle: P,
    ConfirmationAction: () => null,
  }
})

vi.mock('@/components/ai-elements/terminal', () => {
  const P = ({ children }: any) => children ?? null
  const N = () => null
  return {
    Terminal: P, TerminalContent: P, TerminalHeader: N, TerminalLine: N,
    TerminalOutput: N, TerminalCommand: N, TerminalActions: P,
  }
})

vi.mock('@/components/ai-elements/stack-trace', () => {
  const P = ({ children }: any) => children ?? null
  return {
    StackTrace: P, StackTraceFile: () => null, StackTraceFrame: () => null,
    StackTraceHeader: () => null, StackTraceFrameList: P,
  }
})

vi.mock('@/components/ai-elements/test-results', () => {
  const P = ({ children }: any) => children ?? null
  return {
    TestResults: P, TestResultsHeader: () => null, TestResultsSummary: () => null,
    TestResultsCase: () => null, TestResultsCaseList: P,
  }
})

vi.mock('@/components/ai-elements/plan', () => {
  const P = ({ children }: any) => children ?? null
  const N = () => null
  return {
    Plan: P, PlanContent: P, PlanHeader: P, PlanStep: N, PlanStepList: P,
    PlanTitle: P, PlanDescription: P, PlanAction: P, PlanFooter: P, PlanTrigger: P,
  }
})

vi.mock('@/components/ai-elements/task', () => {
  const P = ({ children }: any) => children ?? null
  return { Task: P, TaskContent: P, TaskItem: P, TaskItemFile: () => null, TaskTrigger: () => null }
})

vi.mock('@/components/ai-elements/code-block', () => ({ CodeBlock: () => null }))

vi.mock('@/components/ai-elements/environment-variables', () => {
  const P = ({ children }: any) => children ?? null
  return { EnvironmentVariables: P, EnvironmentVariable: () => null, EnvironmentVariablesHeader: () => null }
})

vi.mock('@/components/ai-elements/attachments', () => {
  const P = ({ children }: any) => children ?? null
  return { Attachments: P, Attachment: () => null }
})

vi.mock('@/components/ai-elements/prompt-input', () => ({ PromptInputButton: () => null }))
vi.mock('@/components/ai-elements/shimmer', () => ({ Shimmer: () => null }))

vi.mock('@/components/ai-elements/audio-player', () => {
  const N = () => null
  return {
    AudioPlayer: N, AudioPlayerControls: N, AudioPlayerProgress: N, AudioPlayerHeader: N,
    AudioPlayerControlBar: N, AudioPlayerDurationDisplay: N, AudioPlayerElement: N,
    AudioPlayerMuteButton: N, AudioPlayerPlayButton: N, AudioPlayerSeekBackwardButton: N,
    AudioPlayerSeekForwardButton: N, AudioPlayerTimeDisplay: N, AudioPlayerTimeRange: N,
    AudioPlayerVolumeRange: N,
  }
})

vi.mock('@/components/ai-elements/checkpoint', () => ({ Checkpoint: () => null }))
vi.mock('@/components/ai-elements/image', () => ({ Image: () => null }))
vi.mock('@/components/ai-elements/message', () => {
  const P = ({ children }: any) => children ?? null
  return { Message: P, MessageContent: P }
})
vi.mock('@/components/ai-elements/panel', () => ({ Panel: ({ children }: any) => children ?? null }))
vi.mock('@/components/ai-elements/snippet', () => {
  const P = ({ children }: any) => children ?? null
  const N = () => null
  return { Snippet: P, SnippetAddon: P, SnippetCopyButton: N, SnippetInput: N, SnippetText: N }
})
vi.mock('@/components/ai-elements/web-preview', () => {
  const P = ({ children }: any) => children ?? null
  const N = () => null
  return {
    WebPreview: P, WebPreviewBody: P, WebPreviewConsole: P,
    WebPreviewNavigation: P, WebPreviewNavigationButton: N, WebPreviewUrl: N,
  }
})

vi.mock('@/components/project/filesystem/utils/file-system-utils', () => ({
  createFileEntryFromUri: vi.fn(),
  FILE_DRAG_REF_MIME: 'application/x-file-ref',
  resolveMimeFromName: vi.fn(() => 'application/octet-stream'),
  resolveFileIcon: vi.fn(() => null),
  fileExtension: vi.fn(() => ''),
}))

vi.mock('@/lib/chat/tool-name', () => ({
  resolveToolDisplayName: ({ toolName, title, type }: any) => title || toolName || type || 'tool',
}))

vi.mock('@openloaf/ui/collapsible', () => {
  const P = ({ children }: any) => children ?? null
  return { Collapsible: P, CollapsibleTrigger: P, CollapsibleContent: P }
})

// ─── Test wrapper ─────────────────────────────────────────────────────

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <ChatSessionProvider
        value={{
          sessionId: 'showcase-test',
          tabId: 'tab-1',
          leafMessageId: null,
          branchMessageIds: [],
          siblingNav: {},
        }}
      >
        <ChatStateProvider
          value={{
            messages: [],
            status: 'ready',
            error: undefined,
            isHistoryLoading: false,
            stepThinking: false,
          }}
        >
          <ChatActionsProvider
            value={{
              sendMessage: vi.fn() as any,
              regenerate: vi.fn() as any,
              addToolApprovalResponse: vi.fn().mockResolvedValue(undefined),
              clearError: vi.fn() as any,
              stopGenerating: vi.fn(),
              updateMessage: vi.fn(),
              newSession: vi.fn(),
              selectSession: vi.fn() as any,
              switchSibling: vi.fn() as any,
              retryAssistantMessage: vi.fn(),
              continueAssistantTurn: vi.fn(),
              resendUserMessage: vi.fn() as any,
              deleteMessageSubtree: vi.fn() as any,
              setPendingCloudMessage: vi.fn(),
              sendPendingCloudMessage: vi.fn(),
            }}
          >
            <ChatToolProvider
              value={{
                toolParts: {},
                upsertToolPart: vi.fn(),
                markToolStreaming: vi.fn(),
                queueToolApprovalPayload: vi.fn(),
                clearToolApprovalPayload: vi.fn(),
                continueAfterToolApprovals: vi.fn(),
              }}
            >
              {children}
            </ChatToolProvider>
          </ChatActionsProvider>
        </ChatStateProvider>
      </ChatSessionProvider>
    </QueryClientProvider>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────

for (const group of TOOL_SHOWCASE_GROUPS) {
  describe(`工具组: ${group.label}`, () => {
    for (const part of group.parts) {
      it(`renders ${part.toolName} without error`, () => {
        // The primary assertion is that render() completes without throwing.
        // Some tools render empty DOM when sub-components are mocked — that's OK.
        expect(() => {
          render(
            <TestWrapper>
              <MessageTool part={part as any} />
            </TestWrapper>,
          )
        }).not.toThrow()
      })
    }
  })
}
