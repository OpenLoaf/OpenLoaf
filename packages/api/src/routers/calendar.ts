import { z } from "zod";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

const calendarRangeSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
});

const calendarSourceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  provider: z.string(),
  kind: z.string(),
  externalId: z.string().nullable().optional(),
  title: z.string(),
  color: z.string().nullable().optional(),
  readOnly: z.boolean(),
  isSubscribed: z.boolean(),
  projectId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const calendarItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sourceId: z.string(),
  kind: z.enum(["event", "reminder"]),
  title: z.string(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  recurrenceRule: z.any().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  sourceUpdatedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const calendarItemCreateSchema = calendarItemSchema
  .omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true })
  .extend({
    id: z.string().optional(),
    workspaceId: z.string().optional(),
  });

const calendarItemUpdateSchema = calendarItemSchema
  .omit({ workspaceId: true, createdAt: true, updatedAt: true })
  .extend({
    workspaceId: z.string().optional(),
  });

const syncSourceInputSchema = z.object({
  kind: z.enum(["calendar", "reminder"]),
  externalId: z.string().nullable().optional(),
  title: z.string(),
  color: z.string().nullable().optional(),
  readOnly: z.boolean().optional(),
  isSubscribed: z.boolean().optional(),
});

const syncItemInputSchema = z.object({
  externalId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  kind: z.enum(["event", "reminder"]),
  title: z.string(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  recurrenceRule: z.any().nullable().optional(),
  completed: z.boolean().optional(),
  sourceUpdatedAt: z.string().nullable().optional(),
});

export const calendarSchemas = {
  listSources: {
    input: z.object({
      workspaceId: z.string().min(1),
      projectId: z.string().optional(),
    }),
    output: z.array(calendarSourceSchema),
  },
  listItems: {
    input: z.object({
      workspaceId: z.string().min(1),
      range: calendarRangeSchema,
      sourceIds: z.array(z.string()).optional(),
      projectId: z.string().optional(),
    }),
    output: z.array(calendarItemSchema),
  },
  createItem: {
    input: z.object({
      workspaceId: z.string().min(1),
      item: calendarItemCreateSchema,
      projectId: z.string().optional(),
    }),
    output: calendarItemSchema,
  },
  updateItem: {
    input: z.object({
      workspaceId: z.string().min(1),
      item: calendarItemUpdateSchema,
    }),
    output: calendarItemSchema,
  },
  deleteItem: {
    input: z.object({
      workspaceId: z.string().min(1),
      id: z.string().min(1),
    }),
    output: z.object({ id: z.string() }),
  },
  toggleReminderCompleted: {
    input: z.object({
      workspaceId: z.string().min(1),
      id: z.string().min(1),
      completed: z.boolean(),
    }),
    output: calendarItemSchema,
  },
  syncFromSystem: {
    input: z.object({
      workspaceId: z.string().min(1),
      provider: z.enum(["macos", "windows"]),
      range: calendarRangeSchema,
      sources: z.array(syncSourceInputSchema),
      items: z.array(syncItemInputSchema),
    }),
    output: z.object({
      ok: z.boolean(),
      sources: z.number(),
      items: z.number(),
    }),
  },
};

export abstract class BaseCalendarRouter {
  public static routeName = "calendar";

  /** Define the calendar router contract. */
  public static createRouter() {
    return t.router({
      listSources: shieldedProcedure
        .input(calendarSchemas.listSources.input)
        .output(calendarSchemas.listSources.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      listItems: shieldedProcedure
        .input(calendarSchemas.listItems.input)
        .output(calendarSchemas.listItems.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      createItem: shieldedProcedure
        .input(calendarSchemas.createItem.input)
        .output(calendarSchemas.createItem.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      updateItem: shieldedProcedure
        .input(calendarSchemas.updateItem.input)
        .output(calendarSchemas.updateItem.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      deleteItem: shieldedProcedure
        .input(calendarSchemas.deleteItem.input)
        .output(calendarSchemas.deleteItem.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      toggleReminderCompleted: shieldedProcedure
        .input(calendarSchemas.toggleReminderCompleted.input)
        .output(calendarSchemas.toggleReminderCompleted.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      syncFromSystem: shieldedProcedure
        .input(calendarSchemas.syncFromSystem.input)
        .output(calendarSchemas.syncFromSystem.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const calendarRouter = BaseCalendarRouter.createRouter();
export type CalendarRouter = typeof calendarRouter;
