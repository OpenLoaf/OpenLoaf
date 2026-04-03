/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { UIMessage } from 'ai'
import type { RequestContext } from '@/ai/shared/context/requestContext'
import { resolveEffectiveAgentName, isBuiltinSubAgentType } from '@/ai/services/agentFactory'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'
import { resolveAgentDir, readAgentJson } from '@/ai/shared/defaultAgentResolver'

// ---------------------------------------------------------------------------
// 输出提取辅助函数
// ---------------------------------------------------------------------------

/**
 * Extract the final summary text from the last assistant message.
 *
 * AI SDK's ToolLoopAgent merges all steps into a single assistant message,
 * so the parts array contains interleaved text (transition phrases) and
 * tool-invocations. We only want the **last text part** — that's the
 * model's final summary after all tool calls are done.
 */
export function extractLastAssistantText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray((msg as any).parts) ? (msg as any).parts : []
    // Walk backwards to find the last text part (the final summary)
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j]
      if (p?.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0) {
        return p.text
      }
    }
  }
  return ''
}

/** Check if the last response ended on a tool call (no trailing text). */
export function lastResponseEndsWithToolCall(responseParts: unknown[]): boolean {
  if (responseParts.length === 0) return false
  // Find the last non-empty part
  for (let i = responseParts.length - 1; i >= 0; i--) {
    const part = responseParts[i] as any
    if (!part || typeof part !== 'object') continue
    const type = typeof part.type === 'string' ? part.type : ''
    // If the last meaningful part is a tool invocation, there's no trailing summary
    if (type === 'tool-invocation' || type.startsWith('tool-')) return true
    if (type === 'text') return false
    // tool-name present = tool part
    if (typeof part.toolName === 'string') return true
  }
  return false
}

/** Count tool invocations across all assistant messages. */
export function countToolInvocations(messages: UIMessage[]): number {
  let count = 0
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray((msg as any).parts) ? (msg as any).parts : []
    for (const p of parts) {
      const type = typeof (p as any)?.type === 'string' ? (p as any).type : ''
      if (type === 'tool-invocation' || type.startsWith('tool-') || typeof (p as any)?.toolName === 'string') {
        count++
      }
    }
  }
  return count
}

/** Resolve skills from a SubAgent's config (empty = no skills). */
export function resolveSubAgentSkills(
  agentName: string,
  requestContext: RequestContext,
): string[] {
  const effectiveName = resolveEffectiveAgentName(agentName)
  // 内置行为类型（general-purpose/explore/plan）不加载 skills
  if (isBuiltinSubAgentType(effectiveName)) return []

  const roots: string[] = []
  if (requestContext.projectId) {
    const projectRoot = getProjectRootPath(requestContext.projectId)
    if (projectRoot) roots.push(projectRoot)
  }

  for (const rootPath of roots) {
    const descriptor = readAgentJson(resolveAgentDir(rootPath, effectiveName))
    if (!descriptor) continue
    return Array.isArray(descriptor.skills) ? descriptor.skills : []
  }
  return []
}
