/**
 * Pure utility functions extracted from ChatCoreProvider.tsx
 * for branch/message-tree operations.
 *
 * These are side-effect-free and can be tested without React.
 */

/**
 * 计算 sendMessage 的 parentMessageId。
 * 从 ChatCoreProvider.tsx 行 792-810 提取。
 */
export function resolveParentMessageId(input: {
  explicitParentMessageId: string | null | undefined
  leafMessageId: string | null
  messages: Array<{ id: string }>
}): string | null {
  const { explicitParentMessageId, leafMessageId, messages } = input

  // 显式传入（含 null 表示根节点）
  if (explicitParentMessageId !== undefined) {
    return explicitParentMessageId
  }

  if (messages.length === 0) return null

  const lastMessageId = String(messages.at(-1)?.id ?? '') || null

  const isLeafInCurrentMessages =
    typeof leafMessageId === 'string' &&
    leafMessageId.length > 0 &&
    messages.some((m) => String(m.id) === leafMessageId)

  return (isLeafInCurrentMessages ? leafMessageId : null) ?? lastMessageId
}

/**
 * retry 时查找 assistant 的 parent user。
 * 从 ChatCoreProvider.tsx 行 914-928 提取。
 */
export function findParentUserForRetry(input: {
  assistantMessageId: string
  assistantParentMessageId?: string | null
  siblingNavParentMessageId?: string | null
  messages: Array<{ id: string; role: string }>
}): string | null {
  const {
    assistantMessageId,
    assistantParentMessageId,
    siblingNavParentMessageId,
    messages,
  } = input

  // 优先使用 assistant 自身的 parentMessageId
  if (typeof assistantParentMessageId === 'string') {
    return assistantParentMessageId
  }

  // 其次使用 siblingNav 中的 parentMessageId
  if (typeof siblingNavParentMessageId === 'string') {
    return siblingNavParentMessageId
  }

  // 兜底：在 messages 中向上找最近的 user
  const idx = messages.findIndex((m) => String(m.id) === assistantMessageId)
  if (idx < 0) return null

  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return String(messages[i].id)
    }
  }

  return null
}

/**
 * 本地切链：截断 messages 到指定 parent（含）。
 * 从 ChatCoreProvider.tsx 行 935-940, 987-1008 提取。
 */
export function sliceMessagesToParent(
  messages: Array<{ id: string }>,
  parentMessageId: string | null,
): Array<{ id: string }> {
  if (parentMessageId === null) return []

  const idx = messages.findIndex((m) => String(m.id) === parentMessageId)
  if (idx < 0) return []

  return messages.slice(0, idx + 1)
}

/**
 * resend 时解析 user 消息的 parentMessageId。
 * 从 ChatCoreProvider.tsx 行 977-980 提取。
 */
export function resolveResendParentMessageId(user: {
  parentMessageId?: string | null
}): string | null {
  if (typeof user.parentMessageId === 'string') return user.parentMessageId
  if (user.parentMessageId === null) return null
  return null
}

/**
 * Check whether text starts with the given command token.
 * Extracted from ChatCoreProvider.tsx line 57-62.
 */
export function isCommandAtStart(text: string, command: string): boolean {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith(command)) return false
  const rest = trimmed.slice(command.length)
  return rest.length === 0 || /^\s/u.test(rest)
}

/**
 * Check whether the message is a compact command request.
 * Extracted from ChatCoreProvider.tsx line 41-48.
 */
export function isCompactCommandMessage(
  input: {
    parts?: unknown[]
    messageKind?: string
  },
  getPlainText: (msg: { parts: unknown[] }) => string,
  summaryHistoryCommand: string,
): boolean {
  if (input.messageKind === 'compact_prompt') return true
  const text = getPlainText({ parts: input.parts ?? [] })
  return isCommandAtStart(text, summaryHistoryCommand)
}

/**
 * Check whether the message is a session command request.
 * Extracted from ChatCoreProvider.tsx line 51-54.
 */
export function isSessionCommandMessage(
  input: { parts?: unknown[] },
  getPlainText: (msg: { parts: unknown[] }) => string,
  summaryTitleCommand: string,
): boolean {
  const text = getPlainText({ parts: input.parts ?? [] })
  return isCommandAtStart(text, summaryTitleCommand)
}
