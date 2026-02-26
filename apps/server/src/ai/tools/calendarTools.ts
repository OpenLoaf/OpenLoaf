import { tool, zodSchema } from 'ai'
import { createContext } from '@openloaf/api/context'
import {
  calendarMutateToolDef,
  calendarQueryToolDef,
} from '@openloaf/api/types/tools/calendar'
import { calendarRouterImplementation } from '@/routers/calendar'
import { getProjectId, getWorkspaceId } from '@/ai/shared/context/requestContext'

/** Slim source view returned to LLM. */
type SourceView = {
  id: string
  provider: string
  kind: string
  title: string
  color: string | null
  readOnly: boolean
  projectId: string | null
}

/** Slim item view returned to LLM. */
type ItemView = {
  id: string
  sourceId: string
  kind: 'event' | 'reminder'
  title: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  allDay: boolean
  completedAt: string | null
}

type CalendarQueryOutput =
  | { ok: true; data: { mode: 'list-sources'; sources: SourceView[] } }
  | { ok: true; data: { mode: 'list-items'; items: ItemView[] } }

type CalendarMutateOutput = {
  ok: true
  data:
    | { action: 'create'; item: ItemView }
    | { action: 'update'; item: ItemView }
    | { action: 'delete'; id: string }
    | { action: 'toggle-completed'; item: ItemView }
}

/** Resolve workspaceId from request context. */
function resolveWorkspaceId(): string {
  const wid = getWorkspaceId()
  if (!wid) throw new Error('workspaceId is required.')
  return wid
}

/** Create a tRPC caller for calendar operations. */
async function createCalendarCaller() {
  const ctx = await createContext({ context: {} as any })
  // 直接使用 server 端实现，而非 @openloaf/api 导出的 base router（base 会抛 Not implemented）。
  return calendarRouterImplementation.createCaller(ctx)
}

/** Strip system fields from source row. */
function toSourceView(row: any): SourceView {
  return {
    id: row.id,
    provider: row.provider,
    kind: row.kind,
    title: row.title,
    color: row.color ?? null,
    readOnly: row.readOnly,
    projectId: row.projectId ?? null,
  }
}

/** Strip system fields from item row. */
function toItemView(row: any): ItemView {
  return {
    id: row.id,
    sourceId: row.sourceId,
    kind: row.kind,
    title: row.title,
    description: row.description ?? null,
    location: row.location ?? null,
    startAt: row.startAt,
    endAt: row.endAt,
    allDay: row.allDay,
    completedAt: row.completedAt ?? null,
  }
}

/** Execute list-sources query. */
async function executeListSources(): Promise<CalendarQueryOutput> {
  const caller = await createCalendarCaller()
  const workspaceId = resolveWorkspaceId()
  const projectId = getProjectId()
  const sources = await caller.listSources({ workspaceId, projectId })
  return { ok: true, data: { mode: 'list-sources', sources: sources.map(toSourceView) } }
}

/** Execute list-items query. */
async function executeListItems(input: {
  rangeStart?: string
  rangeEnd?: string
  sourceIds?: string[]
}): Promise<CalendarQueryOutput> {
  if (!input.rangeStart || !input.rangeEnd) {
    throw new Error('rangeStart and rangeEnd are required for list-items mode.')
  }
  const caller = await createCalendarCaller()
  const workspaceId = resolveWorkspaceId()
  const projectId = getProjectId()
  const items = await caller.listItems({
    workspaceId,
    range: { start: input.rangeStart, end: input.rangeEnd },
    sourceIds: input.sourceIds,
    projectId,
  })
  return { ok: true, data: { mode: 'list-items', items: items.map(toItemView) } }
}

/** Execute create-item mutation. */
async function executeCreateItem(input: {
  sourceId?: string
  kind?: 'event' | 'reminder'
  title?: string
  description?: string | null
  location?: string | null
  startAt?: string
  endAt?: string
  allDay?: boolean
}): Promise<CalendarMutateOutput> {
  if (!input.sourceId) throw new Error('sourceId is required for create.')
  if (!input.kind) throw new Error('kind is required for create.')
  if (!input.title) throw new Error('title is required for create.')
  if (!input.startAt) throw new Error('startAt is required for create.')
  if (!input.endAt) throw new Error('endAt is required for create.')
  const caller = await createCalendarCaller()
  const workspaceId = resolveWorkspaceId()
  const projectId = getProjectId()
  const result = await caller.createItem({
    workspaceId,
    projectId,
    item: {
      sourceId: input.sourceId,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
    },
  })
  return { ok: true, data: { action: 'create', item: toItemView(result) } }
}

/** Execute update-item mutation (merge with existing data). */
async function executeUpdateItem(input: {
  itemId?: string
  sourceId?: string
  kind?: 'event' | 'reminder'
  title?: string
  description?: string | null
  location?: string | null
  startAt?: string
  endAt?: string
  allDay?: boolean
}): Promise<CalendarMutateOutput> {
  if (!input.itemId) throw new Error('itemId is required for update.')
  const caller = await createCalendarCaller()
  const workspaceId = resolveWorkspaceId()
  // 先查询现有数据，合并用户传入的字段。
  const items = await caller.listItems({
    workspaceId,
    range: { start: '1970-01-01T00:00:00Z', end: '2099-12-31T23:59:59Z' },
  })
  const existing = items.find((i) => i.id === input.itemId)
  if (!existing) throw new Error('Calendar item not found.')
  const result = await caller.updateItem({
    workspaceId,
    item: {
      id: input.itemId,
      sourceId: input.sourceId ?? existing.sourceId,
      kind: input.kind ?? existing.kind,
      title: input.title ?? existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      location: input.location !== undefined ? input.location : existing.location,
      startAt: input.startAt ?? existing.startAt,
      endAt: input.endAt ?? existing.endAt,
      allDay: input.allDay ?? existing.allDay,
    },
  })
  return { ok: true, data: { action: 'update', item: toItemView(result) } }
}

/** Execute delete-item mutation. */
async function executeDeleteItem(itemId?: string): Promise<CalendarMutateOutput> {
  if (!itemId) throw new Error('itemId is required for delete.')
  const caller = await createCalendarCaller()
  const workspaceId = resolveWorkspaceId()
  await caller.deleteItem({ workspaceId, id: itemId })
  return { ok: true, data: { action: 'delete', id: itemId } }
}

/** Execute toggle-completed mutation. */
async function executeToggleCompleted(input: {
  itemId?: string
  completed?: boolean
}): Promise<CalendarMutateOutput> {
  if (!input.itemId) throw new Error('itemId is required for toggle-completed.')
  if (input.completed === undefined) throw new Error('completed is required for toggle-completed.')
  const caller = await createCalendarCaller()
  const workspaceId = resolveWorkspaceId()
  const result = await caller.toggleReminderCompleted({
    workspaceId,
    id: input.itemId,
    completed: input.completed,
  })
  return { ok: true, data: { action: 'toggle-completed', item: toItemView(result) } }
}

/** Calendar query tool. */
export const calendarQueryTool = tool({
  description: calendarQueryToolDef.description,
  inputSchema: zodSchema(calendarQueryToolDef.parameters),
  execute: async (input): Promise<CalendarQueryOutput> => {
    const { mode, rangeStart, rangeEnd, sourceIds } = input as any
    if (mode === 'list-sources') return executeListSources()
    return executeListItems({ rangeStart, rangeEnd, sourceIds })
  },
})

/** Calendar mutate tool. */
export const calendarMutateTool = tool({
  description: calendarMutateToolDef.description,
  inputSchema: zodSchema(calendarMutateToolDef.parameters),
  needsApproval: true,
  execute: async (input): Promise<CalendarMutateOutput> => {
    const i = input as any
    if (i.action === 'create') return executeCreateItem(i)
    if (i.action === 'update') return executeUpdateItem(i)
    if (i.action === 'delete') return executeDeleteItem(i.itemId)
    if (i.action === 'toggle-completed') return executeToggleCompleted(i)
    throw new Error(`Unsupported action: ${i.action}`)
  },
})
