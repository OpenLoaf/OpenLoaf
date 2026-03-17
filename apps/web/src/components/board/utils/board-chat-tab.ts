/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { ChatPageContext } from '@openloaf/api/types/message'

/** Normalize an optional id-like string. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Build chat params so the right-side chat panel knows the user is on a board.
 * The right-side chat is fully independent — it does NOT lock its session to boardId.
 * Board-internal AI nodes use boardId as their own session separately.
 */
export function buildBoardChatTabState(boardId: string, projectId?: string | null) {
  const normalizedBoardId = normalizeOptionalId(boardId);
  if (!normalizedBoardId) {
    throw new Error("boardId is required");
  }

  const normalizedProjectId = normalizeOptionalId(projectId);

  const page = normalizedProjectId ? 'project-canvas' : 'temp-canvas'
  const pageContext: ChatPageContext = {
    scope: normalizedProjectId ? 'project' : 'global',
    page,
    projectId: normalizedProjectId,
    boardId: normalizedBoardId,
  }

  return {
    chatParams: {
      boardId: normalizedBoardId,
      projectId: normalizedProjectId ?? null,
      pageContext,
    },
  };
}
