import { z } from 'zod'
import { t, shieldedProcedure } from '../../generated/routers/helpers/createRouter'

/** Tenas extension field in package.json. */
const tenasConfigSchema = z.object({
  type: z.literal('widget'),
  defaultSize: z.string().optional(),
  constraints: z
    .object({
      defaultW: z.number(),
      defaultH: z.number(),
      minW: z.number(),
      minH: z.number(),
      maxW: z.number(),
      maxH: z.number(),
    })
    .optional(),
  support: z
    .object({
      workspace: z.boolean(),
      project: z.boolean(),
    })
    .optional(),
})

/** Widget metadata returned by list/get. */
const widgetMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  main: z.string(),
  scripts: z.record(z.string(), z.string()).optional(),
  tenas: tenasConfigSchema.optional(),
})

export const dynamicWidgetSchemas = {
  list: {
    input: z.object({
      workspaceId: z.string(),
      projectId: z.string().optional(),
    }),
    output: z.array(widgetMetaSchema),
  },
  get: {
    input: z.object({ workspaceId: z.string(), projectId: z.string().optional(), widgetId: z.string() }),
    output: widgetMetaSchema.nullable(),
  },
  save: {
    input: z.object({
      workspaceId: z.string(),
      projectId: z.string().optional(),
      widgetId: z.string(),
      files: z.record(z.string(), z.string()),
    }),
    output: z.object({ ok: z.boolean(), widgetId: z.string() }),
  },
  delete: {
    input: z.object({ workspaceId: z.string(), projectId: z.string().optional(), widgetId: z.string() }),
    output: z.object({ ok: z.boolean() }),
  },
  callFunction: {
    input: z.object({
      workspaceId: z.string(),
      projectId: z.string().optional(),
      widgetId: z.string(),
      functionName: z.string(),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
    }),
  },
  compile: {
    input: z.object({ workspaceId: z.string(), projectId: z.string().optional(), widgetId: z.string() }),
    output: z.object({
      ok: z.boolean(),
      code: z.string().optional(),
      error: z.string().optional(),
    }),
  },
}

export abstract class BaseDynamicWidgetRouter {
  public static routeName = 'dynamicWidget'

  public static createRouter() {
    return t.router({
      list: shieldedProcedure
        .input(dynamicWidgetSchemas.list.input)
        .output(dynamicWidgetSchemas.list.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
      get: shieldedProcedure
        .input(dynamicWidgetSchemas.get.input)
        .output(dynamicWidgetSchemas.get.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
      save: shieldedProcedure
        .input(dynamicWidgetSchemas.save.input)
        .output(dynamicWidgetSchemas.save.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      delete: shieldedProcedure
        .input(dynamicWidgetSchemas.delete.input)
        .output(dynamicWidgetSchemas.delete.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      callFunction: shieldedProcedure
        .input(dynamicWidgetSchemas.callFunction.input)
        .output(dynamicWidgetSchemas.callFunction.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      compile: shieldedProcedure
        .input(dynamicWidgetSchemas.compile.input)
        .output(dynamicWidgetSchemas.compile.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
    })
  }
}

export const dynamicWidgetRouter = BaseDynamicWidgetRouter.createRouter()
export type DynamicWidgetRouter = typeof dynamicWidgetRouter
