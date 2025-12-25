import { z } from "zod";
import { t, shieldedProcedure } from "../index";

const settingItemSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  value: z.any(),
  secret: z.boolean(),
  category: z.string().optional(),
  isReadonly: z.boolean(),
  syncToCloud: z.boolean().optional(),
});

export const settingSchemas = {
  getAll: {
    output: z.array(settingItemSchema),
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
    });
  }
}

export const settingRouter = BaseSettingRouter.createRouter();
export type SettingRouter = typeof settingRouter;
