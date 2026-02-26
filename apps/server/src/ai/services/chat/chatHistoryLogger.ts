/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/**
 * Chat history logger — simplified after JSONL migration.
 * The JSONL file itself is now the persistent storage, so the old
 * dev-mode branch context logging is no longer needed.
 */

/** Persist full llm context log — no-op after JSONL migration. */
export async function persistChatBranchContextLog(_input: {
  sessionId: string
  workspaceId?: string
  leafMessageId: string
  modelMessages: unknown[]
}): Promise<void> {
  // JSONL 本身就是持久化存储，不再需要额外的分支日志。
}

/** Resolve current branch jsonl path — no-op after JSONL migration. */
export async function resolveBranchJsonlPathFromLeafMessage(_input: {
  sessionId: string
  workspaceId?: string | null
  leafMessageId: string
  prismaReader?: unknown
}): Promise<string | null> {
  return null
}
