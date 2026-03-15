/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import { appRouter } from '@openloaf/api'
import { createContext } from '@openloaf/api/context'
import {
  boardQueryToolDef,
  boardMutateToolDef,
} from '@openloaf/api/types/tools/board'
import { getProjectId } from '@/ai/shared/context/requestContext'

/** Slim board view returned to LLM. */
type BoardView = {
  /** Board id. */
  boardId: string
  /** Board title. */
  title: string
  /** Whether the board is pinned. */
  isPin: boolean
  /** Associated project id (null if unbound). */
  projectId: string | null
  /** Board folder URI. */
  folderUri: string
  /** Creation time (ISO string). */
  createdAt: string
  /** Last update time (ISO string). */
  updatedAt: string
}

/** Output payload for board-query tool. */
type BoardQueryToolOutput = {
  ok: true
  data:
    | { mode: 'list'; boards: BoardView[] }
    | { mode: 'get'; board: BoardView | null }
}

/** Output payload for board-mutate tool. */
type BoardMutateToolOutput = {
  ok: true
  data:
    | { action: 'create'; board: BoardView }
    | { action: 'update'; board: BoardView }
    | { action: 'delete'; boardId: string }
    | { action: 'hard-delete'; boardId: string; deletedSessions: number }
    | { action: 'duplicate'; board: BoardView }
    | { action: 'clear-unbound'; deletedBoards: number; deletedSessions: number }
}

/** Create a tRPC caller for board operations. */
async function createBoardCaller() {
  const ctx = await createContext({ context: {} as any })
  return appRouter.createCaller(ctx).board
}

/** Convert raw board row to slim view. */
function toBoardView(row: any): BoardView {
  return {
    boardId: row.id,
    title: row.title,
    isPin: row.isPin ?? false,
    projectId: row.projectId ?? null,
    folderUri: row.folderUri,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

/** Execute list operation.
 * List mode does NOT auto-scope to current project — users expect to see all boards.
 * Only filter by projectId when explicitly provided.
 */
async function executeBoardList(input: {
  projectId?: string
  search?: string
  unboundOnly?: boolean
}): Promise<BoardQueryToolOutput> {
  const caller = await createBoardCaller()

  if (input.search || input.unboundOnly) {
    const page = await caller.listPaged({
      projectId: input.projectId,
      search: input.search,
      unboundOnly: input.unboundOnly,
      pageSize: 50,
    })
    return {
      ok: true,
      data: { mode: 'list', boards: page.items.map(toBoardView) },
    }
  }

  const boards = await caller.list({ projectId: input.projectId })
  return {
    ok: true,
    data: { mode: 'list', boards: boards.map(toBoardView) },
  }
}

/** Execute get operation. */
async function executeBoardGet(boardId: string): Promise<BoardQueryToolOutput> {
  const caller = await createBoardCaller()
  const board = await caller.get({ boardId })
  return {
    ok: true,
    data: { mode: 'get', board: board ? toBoardView(board) : null },
  }
}

/** Execute create operation. */
async function executeBoardCreate(input: {
  title?: string
  projectId?: string
}): Promise<BoardMutateToolOutput> {
  const caller = await createBoardCaller()
  const projectId = input.projectId ?? getProjectId()
  const board = await caller.create({
    title: input.title,
    projectId,
  })
  return { ok: true, data: { action: 'create', board: toBoardView(board) } }
}

/** Execute update operation. */
async function executeBoardUpdate(input: {
  boardId: string
  title?: string
  projectId?: string
  isPin?: boolean
}): Promise<BoardMutateToolOutput> {
  const caller = await createBoardCaller()
  const board = await caller.update({
    boardId: input.boardId,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.isPin !== undefined ? { isPin: input.isPin } : {}),
  })
  return { ok: true, data: { action: 'update', board: toBoardView(board) } }
}

/** Execute delete (soft) operation. */
async function executeBoardDelete(boardId: string): Promise<BoardMutateToolOutput> {
  const caller = await createBoardCaller()
  await caller.delete({ boardId })
  return { ok: true, data: { action: 'delete', boardId } }
}

/** Execute hard-delete operation. */
async function executeBoardHardDelete(input: {
  boardId: string
  projectId?: string
}): Promise<BoardMutateToolOutput> {
  const caller = await createBoardCaller()
  const result = await caller.hardDelete({
    boardId: input.boardId,
    projectId: input.projectId,
  })
  return {
    ok: true,
    data: {
      action: 'hard-delete',
      boardId: input.boardId,
      deletedSessions: (result as any).deletedSessions ?? 0,
    },
  }
}

/** Execute duplicate operation. */
async function executeBoardDuplicate(input: {
  boardId: string
  projectId?: string
}): Promise<BoardMutateToolOutput> {
  const caller = await createBoardCaller()
  const board = await caller.duplicate({
    boardId: input.boardId,
    projectId: input.projectId,
  })
  return { ok: true, data: { action: 'duplicate', board: toBoardView(board) } }
}

/** Execute clear-unbound operation (delete all boards not associated with a project). */
async function executeBoardClearUnbound(): Promise<BoardMutateToolOutput> {
  const caller = await createBoardCaller()
  const result = await caller.clearUnboundBoards({})
  return {
    ok: true,
    data: {
      action: 'clear-unbound',
      deletedBoards: result.deletedBoards,
      deletedSessions: result.deletedSessions,
    },
  }
}

/** Board query tool. */
export const boardQueryTool = tool({
  description: boardQueryToolDef.description,
  inputSchema: zodSchema(boardQueryToolDef.parameters),
  execute: async (input): Promise<BoardQueryToolOutput> => {
    const i = input as any
    const mode = i.mode ?? 'list'
    if (mode === 'get') {
      if (!i.boardId) throw new Error('boardId is required for get mode.')
      return executeBoardGet(i.boardId)
    }
    return executeBoardList({
      projectId: i.projectId,
      search: i.search,
      unboundOnly: i.unboundOnly,
    })
  },
})

/** Board mutate tool. */
export const boardMutateTool = tool({
  description: boardMutateToolDef.description,
  inputSchema: zodSchema(boardMutateToolDef.parameters),
  needsApproval: false,
  execute: async (input): Promise<BoardMutateToolOutput> => {
    const i = input as any
    if (i.action === 'create') return executeBoardCreate(i)
    if (i.action === 'update') {
      if (!i.boardId) throw new Error('boardId is required for update.')
      return executeBoardUpdate(i)
    }
    if (i.action === 'delete') {
      if (!i.boardId) throw new Error('boardId is required for delete.')
      return executeBoardDelete(i.boardId)
    }
    if (i.action === 'hard-delete') {
      if (!i.boardId) throw new Error('boardId is required for hard-delete.')
      return executeBoardHardDelete(i)
    }
    if (i.action === 'duplicate') {
      if (!i.boardId) throw new Error('boardId is required for duplicate.')
      return executeBoardDuplicate(i)
    }
    if (i.action === 'clear-unbound') return executeBoardClearUnbound()
    throw new Error(`Unsupported action: ${i.action}`)
  },
})
