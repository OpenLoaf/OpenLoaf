import type { ToolLoopAgent } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { createBrowserSubAgent } from './browserSubAgent'
import { createDocumentAnalysisSubAgent } from './documentAnalysisSubAgent'
import { createTestApprovalSubAgent } from './testApprovalSubAgent'

export type SubAgentType =
  | 'browser'
  | 'document-analysis'
  | 'test-approval'
  | 'default'

/** Resolve raw agentType string to a known SubAgentType. */
export function resolveAgentType(raw?: string): SubAgentType {
  if (!raw) return 'default'
  const lower = raw.toLowerCase().trim()
  if (lower === 'browser' || lower === 'browsersubagent') return 'browser'
  if (
    lower === 'document-analysis' ||
    lower === 'documentanalysissubagent'
  ) {
    return 'document-analysis'
  }
  if (
    lower === 'test-approval' ||
    lower === 'testapprovalsubagent'
  ) {
    return 'test-approval'
  }
  return 'default'
}

/** Create a ToolLoopAgent instance by agentType. */
export function createSubAgent(input: {
  agentType: SubAgentType
  model: LanguageModelV3
}): ToolLoopAgent {
  switch (input.agentType) {
    case 'browser':
      return createBrowserSubAgent({ model: input.model })
    case 'document-analysis':
      return createDocumentAnalysisSubAgent({ model: input.model })
    case 'test-approval':
      return createTestApprovalSubAgent({ model: input.model })
    case 'default':
      return createDocumentAnalysisSubAgent({ model: input.model })
  }
}
