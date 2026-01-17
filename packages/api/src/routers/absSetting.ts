import { z } from "zod";
import { t, shieldedProcedure } from "../index";
import { basicConfigSchema, basicConfigUpdateSchema } from "../types/basic";

const settingItemSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  value: z.any(),
  secret: z.boolean(),
  category: z.string().optional(),
  isReadonly: z.boolean(),
  syncToCloud: z.boolean().optional(),
});

const cliToolIdSchema = z.enum(["codex", "claudeCode"]);

const cliToolStatusSchema = z.object({
  id: cliToolIdSchema,
  installed: z.boolean(),
  version: z.string().optional(),
  latestVersion: z.string().optional(),
  hasUpdate: z.boolean().optional(),
});

/** Skill scope enum. */
const skillScopeSchema = z.enum(["workspace", "project"]);

/** Skill summary payload. */
const skillSummarySchema = z.object({
  /** Skill name. */
  name: z.string(),
  /** Skill description. */
  description: z.string(),
  /** Skill file path. */
  path: z.string(),
  /** Skill scope. */
  scope: skillScopeSchema,
});

export const settingSchemas = {
  getAll: {
    output: z.array(settingItemSchema),
  },
  getProviders: {
    output: z.array(settingItemSchema),
  },
  getS3Providers: {
    output: z.array(settingItemSchema),
  },
  getBasic: {
    output: basicConfigSchema,
  },
  getCliToolsStatus: {
    output: z.array(cliToolStatusSchema),
  },
  /** Get skills summary list. */
  getSkills: {
    input: z
      .object({
        /** Project id for project-scoped skills. */
        projectId: z.string().optional(),
      })
      .optional(),
    output: z.array(skillSummarySchema),
  },
  set: {
    input: z.object({
      key: z.string(),
      value: z.any(),
      category: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  remove: {
    input: z.object({
      key: z.string(),
      category: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  installCliTool: {
    input: z.object({
      id: cliToolIdSchema,
    }),
    output: z.object({
      ok: z.boolean(),
      status: cliToolStatusSchema,
    }),
  },
  checkCliToolUpdate: {
    input: z.object({
      id: cliToolIdSchema,
    }),
    output: z.object({
      ok: z.boolean(),
      status: cliToolStatusSchema,
    }),
  },
  setBasic: {
    input: basicConfigUpdateSchema,
    output: basicConfigSchema,
  },
};

export abstract class BaseSettingRouter {
  public static routeName = "settings";

  /** Define the settings router contract. */
  public static createRouter() {
    return t.router({
      getAll: shieldedProcedure
        .output(settingSchemas.getAll.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getProviders: shieldedProcedure
        .output(settingSchemas.getProviders.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getS3Providers: shieldedProcedure
        .output(settingSchemas.getS3Providers.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getBasic: shieldedProcedure
        .output(settingSchemas.getBasic.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getCliToolsStatus: shieldedProcedure
        .output(settingSchemas.getCliToolsStatus.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getSkills: shieldedProcedure
        .input(settingSchemas.getSkills.input)
        .output(settingSchemas.getSkills.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      remove: shieldedProcedure
        .input(settingSchemas.remove.input)
        .output(settingSchemas.remove.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      installCliTool: shieldedProcedure
        .input(settingSchemas.installCliTool.input)
        .output(settingSchemas.installCliTool.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      checkCliToolUpdate: shieldedProcedure
        .input(settingSchemas.checkCliToolUpdate.input)
        .output(settingSchemas.checkCliToolUpdate.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      setBasic: shieldedProcedure
        .input(settingSchemas.setBasic.input)
        .output(settingSchemas.setBasic.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const settingRouter = BaseSettingRouter.createRouter();
export type SettingRouter = typeof settingRouter;
