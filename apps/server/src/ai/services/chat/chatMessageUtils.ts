/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { type UIMessage } from 'ai'
import type { OpenLoafUIMessage } from '@openloaf/api/types/message'
import { extractTextFromParts } from '@/ai/services/chat/chatStreamUtils'
import { parseCommandAtStart } from '@/ai/tools/CommandParser'

/** Check whether the message is a compact command request. */
export function isCompactCommandMessage(message: OpenLoafUIMessage | undefined): boolean {
  if (!message || message.role !== 'user') return false
  if ((message as any)?.messageKind === 'compact_prompt') return true
  const text = extractTextFromParts(message.parts ?? [])
  const command = parseCommandAtStart(text)
  return command?.id === 'summary-history' || command?.id === 'compact'
}

/** Build the compact prompt text sent to the model. */
export function buildCompactPromptText(): string {
  return [
    '# 任务',
    '请对当前对话进行压缩摘要，供后续继续对话使用。',
    '要求：',
    '- 保留明确需求、约束、决策、关键事实。',
    '- 保留重要数据、参数、文件路径、命令、接口信息。',
    '- 标注未完成事项与风险。',
    '- 用精简要点，不要展开推理过程。',
    '输出格式：',
    '## 摘要',
    '## 关键决策',
    '## 待办',
    '## 风险/疑点',
    '## 涉及文件',
  ].join('\n')
}

type SanitizedRequestParts = {
  /** Sanitized parts for metadata. */
  parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }>
  /** Metadata flags derived from sanitization. */
  flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean }
  /** Warning messages for logs. */
  warnings: string[]
}

/** Sanitize request parts for metadata persistence. */
export function sanitizeRequestParts(parts: unknown[]): SanitizedRequestParts {
  const sanitized: Array<{ type: string; text?: string; url?: string; mediaType?: string }> = []
  const warnings: string[] = []
  const flags: { hasDataUrlOmitted?: boolean; hasBinaryOmitted?: boolean } = {}
  let dataUrlCount = 0
  let binaryCount = 0

  for (const rawPart of parts) {
    if (!rawPart || typeof rawPart !== 'object') continue
    const part = rawPart as Record<string, unknown>
    const type = typeof part.type === 'string' ? part.type : ''
    if (type === 'text') {
      if (typeof part.text === 'string' && part.text.trim()) {
        sanitized.push({ type: 'text', text: part.text })
      }
      continue
    }
    if (type === 'file') {
      const mediaType = typeof part.mediaType === 'string' ? part.mediaType : undefined
      const url = typeof part.url === 'string' ? part.url : ''
      if (url.startsWith('data:')) {
        // 逻辑：data url 不写入元信息，改为占位符。
        dataUrlCount += 1
        flags.hasDataUrlOmitted = true
        sanitized.push({ type: 'file', url: '[data-url-omitted]', mediaType })
        continue
      }
      if (!url) {
        // 逻辑：未知二进制内容不写入元信息，改为占位符。
        binaryCount += 1
        flags.hasBinaryOmitted = true
        sanitized.push({ type: 'file', url: '[binary-omitted]', mediaType })
        continue
      }
      sanitized.push({ type: 'file', url, mediaType })
    }
  }

  if (dataUrlCount > 0) {
    warnings.push(`metadata omitted ${dataUrlCount} data url(s)`)
  }
  if (binaryCount > 0) {
    warnings.push(`metadata omitted ${binaryCount} binary part(s)`)
  }

  return { parts: sanitized, flags, warnings }
}

/** Resolve the latest user message in a message list. */
export function resolveLatestUserMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as UIMessage
    if (message?.role === 'user') return message
  }
  return null
}
